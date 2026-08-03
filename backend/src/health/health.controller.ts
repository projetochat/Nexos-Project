import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingOutboundQueue } from "../queue/messaging-outbound.queue";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingOutboundQueue) private readonly queue: MessagingOutboundQueue,
  ) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.queue.health();
    return {
      ok: true,
      service: "nexos-api",
      database: "up",
      redis: redis.ok ? "up" : "down",
      timestamp: new Date().toISOString(),
    };
  }
}
