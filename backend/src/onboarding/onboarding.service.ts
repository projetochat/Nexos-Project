import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { CompleteOnboardingDto } from "./dto/complete-onboarding.dto";
import { UpdateOnboardingProgressDto } from "./dto/update-onboarding-progress.dto";

const TOTAL_STEPS = 8;

type OnboardingRow = {
  tenantId: string;
  status: "PENDING" | "COMPLETED";
  currentStep: number;
  maxCompletedStep: number;
  version: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type Checklist = {
  instanceConnected: boolean;
  activeDepartment: boolean;
  administratorProfile: boolean;
  activeAdministrator: boolean;
  quickRepliesReviewed: boolean;
  tagsReviewed: boolean;
};

type OnboardingDatabase = Pick<
  PrismaService,
  "$queryRaw" | "messagingConnection" | "department" | "role" | "tenantMembership"
>;

@Injectable()
export class OnboardingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async status(current: AuthenticatedUser) {
    const row = await this.findState(this.prisma, current.tenantId);
    return this.serialize(current, row, await this.checklist(this.prisma, current.tenantId, row));
  }

  async updateProgress(dto: UpdateOnboardingProgressDto, current: AuthenticatedUser) {
    this.assertAdministrator(current);
    if (dto.currentStep > dto.maxCompletedStep + 1) {
      throw new BadRequestException({
        code: "ONBOARDING_INVALID_PROGRESS",
        message: "Conclua as etapas anteriores antes de avançar.",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockState(tx, current.tenantId);
      if (!existing) throw onboardingNotRequired();
      if (existing.status === "COMPLETED") {
        return this.serialize(
          current,
          existing,
          await this.checklist(tx, current.tenantId, existing),
        );
      }
      if (existing.version !== dto.version) {
        throw await this.versionConflict(current, tx, existing);
      }
      if (dto.maxCompletedStep > existing.maxCompletedStep + 1) {
        throw new BadRequestException({
          code: "ONBOARDING_STEP_SEQUENCE_REQUIRED",
          message: "Conclua uma etapa por vez.",
        });
      }

      const currentStep = Math.max(existing.currentStep, dto.currentStep);
      const maxCompletedStep = Math.max(existing.maxCompletedStep, dto.maxCompletedStep);
      if (currentStep > maxCompletedStep + 1) {
        throw new BadRequestException({
          code: "ONBOARDING_STEP_SEQUENCE_REQUIRED",
          message: "Conclua a etapa atual antes de avançar.",
        });
      }
      const checklist = await this.checklist(tx, current.tenantId, {
        ...existing,
        currentStep,
        maxCompletedStep,
      });
      if (maxCompletedStep > existing.maxCompletedStep) {
        this.assertStepRequirement(maxCompletedStep, checklist);
      }
      const [updated] = await tx.$queryRaw<OnboardingRow[]>(
        Prisma.sql`
          UPDATE "tenant_onboarding_states"
          SET
            "currentStep" = ${currentStep},
            "maxCompletedStep" = ${maxCompletedStep},
            "version" = "version" + 1,
            "updatedAt" = NOW()
          WHERE "tenantId" = ${current.tenantId}
          RETURNING *
        `,
      );
      return this.serialize(current, updated, checklist);
    });
  }

  async complete(dto: CompleteOnboardingDto, current: AuthenticatedUser) {
    this.assertAdministrator(current);
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockState(tx, current.tenantId);
      if (!existing) throw onboardingNotRequired();
      if (existing.status === "COMPLETED") {
        return this.serialize(
          current,
          existing,
          await this.checklist(tx, current.tenantId, existing),
        );
      }
      if (existing.version !== dto.version) {
        throw await this.versionConflict(current, tx, existing);
      }
      if (existing.maxCompletedStep < 7 || existing.currentStep !== TOTAL_STEPS) {
        throw new BadRequestException({
          code: "ONBOARDING_STEP_SEQUENCE_REQUIRED",
          message: "Revise todas as etapas antes de concluir a configuração inicial.",
        });
      }

      const checklist = await this.checklist(tx, current.tenantId, existing);
      if (
        !checklist.instanceConnected ||
        !checklist.activeDepartment ||
        !checklist.administratorProfile ||
        !checklist.activeAdministrator ||
        !checklist.quickRepliesReviewed ||
        !checklist.tagsReviewed
      ) {
        throw new BadRequestException({
          code: "ONBOARDING_REQUIREMENTS_NOT_MET",
          message: "Conclua os requisitos obrigatórios antes de acessar a plataforma.",
          checklist,
        });
      }

      const [updated] = await tx.$queryRaw<OnboardingRow[]>(
        Prisma.sql`
          UPDATE "tenant_onboarding_states"
          SET
            "status" = 'COMPLETED',
            "currentStep" = ${TOTAL_STEPS},
            "maxCompletedStep" = ${TOTAL_STEPS},
            "version" = "version" + 1,
            "completedAt" = COALESCE("completedAt", NOW()),
            "updatedAt" = NOW()
          WHERE "tenantId" = ${current.tenantId}
          RETURNING *
        `,
      );
      return this.serialize(current, updated, {
        ...checklist,
        quickRepliesReviewed: true,
        tagsReviewed: true,
      });
    });
  }

  private assertAdministrator(current: AuthenticatedUser) {
    if (current.roleKey !== "tenant_admin" || current.impersonationSessionId) {
      throw new ForbiddenException({
        code: "ONBOARDING_ADMIN_REQUIRED",
        message: "Somente o administrador da organização pode concluir a configuração inicial.",
      });
    }
  }

  private assertStepRequirement(step: number, checklist: Checklist) {
    const requirement = {
      2: checklist.instanceConnected,
      3: checklist.activeDepartment,
      4: checklist.administratorProfile,
      5: checklist.activeAdministrator,
    }[step];
    if (requirement === false) {
      throw new BadRequestException({
        code: "ONBOARDING_STEP_REQUIREMENT_NOT_MET",
        message: "Conclua os requisitos desta etapa antes de avançar.",
        step,
        checklist,
      });
    }
  }

  private async findState(db: OnboardingDatabase, tenantId: string) {
    const [row] = await db.$queryRaw<OnboardingRow[]>(
      Prisma.sql`
        SELECT *
        FROM "tenant_onboarding_states"
        WHERE "tenantId" = ${tenantId}
        LIMIT 1
      `,
    );
    return row ?? null;
  }

  private async lockState(tx: Prisma.TransactionClient, tenantId: string) {
    const [row] = await tx.$queryRaw<OnboardingRow[]>(
      Prisma.sql`
        SELECT *
        FROM "tenant_onboarding_states"
        WHERE "tenantId" = ${tenantId}
        FOR UPDATE
      `,
    );
    return row ?? null;
  }

  private async checklist(
    db: OnboardingDatabase,
    tenantId: string,
    row: OnboardingRow | null,
  ): Promise<Checklist> {
    if (!row) {
      return {
        instanceConnected: true,
        activeDepartment: true,
        administratorProfile: true,
        activeAdministrator: true,
        quickRepliesReviewed: true,
        tagsReviewed: true,
      };
    }
    const [instanceConnected, activeDepartment, administratorProfile, activeAdministrator] =
      await Promise.all([
        db.messagingConnection.count({
          where: { tenantId, status: "CONNECTED", archivedAt: null },
        }),
        db.department.count({ where: { tenantId, active: true } }),
        db.role.count({ where: { tenantId, key: "tenant_admin" } }),
        db.tenantMembership.count({
          where: {
            tenantId,
            status: "ACTIVE",
            role: { key: "tenant_admin" },
            user: { status: "ACTIVE" },
          },
        }),
      ]);
    return {
      instanceConnected: instanceConnected > 0,
      activeDepartment: activeDepartment > 0,
      administratorProfile: administratorProfile > 0,
      activeAdministrator: activeAdministrator > 0,
      quickRepliesReviewed: row.maxCompletedStep >= 6,
      tagsReviewed: row.maxCompletedStep >= 7,
    };
  }

  private serialize(current: AuthenticatedUser, row: OnboardingRow | null, checklist: Checklist) {
    if (!row) {
      return {
        required: false,
        status: "not_required" as const,
        progress: {
          currentStep: TOTAL_STEPS,
          maxCompletedStep: TOTAL_STEPS,
          totalSteps: TOTAL_STEPS,
        },
        version: null,
        canManage: false,
        message: null,
        checklist,
      };
    }
    const completed = row.status === "COMPLETED";
    const canManage = current.roleKey === "tenant_admin" && !current.impersonationSessionId;
    return {
      required: true,
      status: completed ? ("completed" as const) : ("pending" as const),
      progress: {
        currentStep: row.currentStep,
        maxCompletedStep: row.maxCompletedStep,
        totalSteps: TOTAL_STEPS,
      },
      version: row.version,
      canManage,
      message: completed
        ? null
        : canManage
          ? "Conclua a configuração inicial para liberar o acesso à plataforma."
          : "A configuração inicial da organização ainda não foi concluída pelo administrador.",
      checklist,
    };
  }

  private async versionConflict(
    current: AuthenticatedUser,
    db: OnboardingDatabase,
    row: OnboardingRow,
  ) {
    return new ConflictException({
      code: "ONBOARDING_VERSION_CONFLICT",
      message: "O progresso foi atualizado em outra sessão. Recarregue os dados e tente novamente.",
      current: this.serialize(current, row, await this.checklist(db, current.tenantId, row)),
    });
  }
}

function onboardingNotRequired() {
  return new BadRequestException({
    code: "ONBOARDING_NOT_REQUIRED",
    message: "Esta organização não precisa executar a configuração inicial.",
  });
}
