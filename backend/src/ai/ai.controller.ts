import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { AiProvider } from "../generated/prisma";
import { RequireTenantFeature } from "../platform/tenant-feature.decorator";
import { TenantFeatureGuard } from "../platform/tenant-feature.guard";
import {
  CreateAiAgentDto,
  CreateAiConnectionDto,
  CreateTicketDraftDto,
  UpdateAiAgentDto,
  UpdateAiConnectionDto,
} from "./ai.dto";
import { AiService } from "./ai.service";

@Controller("ai")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  @Get("connections")
  @RequirePermissions("ai_agents.read")
  listConnections(@CurrentUser() current: AuthenticatedUser) {
    return this.ai.listConnections(current);
  }

  @Get("connections/:id")
  @RequirePermissions("ai_agents.read")
  connection(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.connection(id, current);
  }

  @Post("connections")
  @RequirePermissions("ai_agents.create")
  createConnection(@Body() dto: CreateAiConnectionDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.createConnection(dto, current);
  }

  @Patch("connections/:id")
  @RequirePermissions("ai_agents.update")
  updateConnection(
    @Param("id") id: string,
    @Body() dto: UpdateAiConnectionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ai.updateConnection(id, dto, current);
  }

  @Delete("connections/:id")
  @RequirePermissions("ai_agents.delete")
  deleteConnection(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.deleteConnection(id, current);
  }

  @Get("providers/:provider/models")
  @RequirePermissions("ai_agents.read")
  providerModels(@Param("provider") provider: string) {
    if (!Object.values(AiProvider).includes(provider as AiProvider)) {
      throw new BadRequestException("Provedor de IA inválido.");
    }
    return this.ai.providerModels(provider as AiProvider);
  }

  @Get("agents")
  @RequirePermissions("ai_agents.read")
  listAgents(
    @Query("all") all: string | undefined,
    @Query("connectionId") connectionId: string | undefined,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ai.listAgents(current, { all: all === "true", connectionId });
  }

  @Get("agents/:id")
  @RequirePermissions("ai_agents.read")
  agent(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.agent(id, current);
  }

  @Post("agents")
  @RequirePermissions("ai_agents.create")
  createAgent(@Body() dto: CreateAiAgentDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.createAgent(dto, current);
  }

  @Patch("agents/:id")
  @RequirePermissions("ai_agents.update")
  updateAgent(
    @Param("id") id: string,
    @Body() dto: UpdateAiAgentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ai.updateAgent(id, dto, current);
  }

  @Post("agents/:id/duplicate")
  @RequirePermissions("ai_agents.create")
  duplicateAgent(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.duplicateAgent(id, current);
  }

  @Delete("agents/:id")
  @RequirePermissions("ai_agents.delete")
  deleteAgent(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.deleteAgent(id, current);
  }

  @Post("ticket-drafts")
  @RequirePermissions("conversations.read", "tickets.create")
  @RequireTenantFeature("tickets")
  @UseGuards(TenantFeatureGuard)
  ticketDraft(@Body() dto: CreateTicketDraftDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.ticketDraft(dto, current);
  }

  @Get("executions/:id")
  @RequirePermissions("conversations.read", "tickets.create")
  @RequireTenantFeature("tickets")
  @UseGuards(TenantFeatureGuard)
  execution(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ai.execution(id, current);
  }
}
