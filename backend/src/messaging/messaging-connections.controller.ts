import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { CreateEvolutionConnectionDto } from "./dto/create-evolution-connection.dto";
import { MessagingConnectionsService } from "./messaging-connections.service";

@Controller("messaging/connections")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessagingConnectionsController {
  constructor(
    @Inject(MessagingConnectionsService)
    private readonly connections: MessagingConnectionsService,
  ) {}

  @Get()
  @RequirePermissions("connections.read")
  list(@CurrentUser() current: AuthenticatedUser) {
    return this.connections.list(current);
  }

  @Get("health/evolution")
  @RequirePermissions("connections.read")
  providerHealth() {
    return this.connections.providerHealth();
  }

  @Get(":id")
  @RequirePermissions("connections.read")
  detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.connections.detail(id, current);
  }

  @Post("evolution")
  @RequirePermissions("connections.manage")
  createEvolution(
    @Body() dto: CreateEvolutionConnectionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.connections.createEvolution(dto, current);
  }

  @Get(":id/status")
  @RequirePermissions("connections.read")
  status(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.connections.status(id, current);
  }

  @Get(":id/qr")
  @RequirePermissions("connections.manage")
  qrCode(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.connections.qrCode(id, current);
  }

  @Patch(":id/logout")
  @RequirePermissions("connections.manage")
  logout(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.connections.logout(id, current);
  }

  @Delete(":id")
  @RequirePermissions("connections.manage")
  remove(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.connections.remove(id, current);
  }
}
