import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Controller("tenant-records")
@UseGuards(JwtAuthGuard)
export class TenantRecordsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const record = await this.prisma.protectedRecord.findFirst({
      where: {
        id,
        tenantId: current.tenantId,
      },
    });
    if (!record) throw new NotFoundException("Registro nao encontrado.");

    return {
      id: record.id,
      title: record.title,
      body: record.body,
      tenantId: record.tenantId,
    };
  }
}
