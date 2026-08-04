import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { randomUUID } from "node:crypto";

type PlatformErrorCode =
  | "PLATFORM_QUERY_INVALID"
  | "PLATFORM_DATA_INCONSISTENT"
  | "PLATFORM_RESOURCE_NOT_FOUND"
  | "PLATFORM_DATABASE_UNAVAILABLE"
  | "PLATFORM_UNEXPECTED_ERROR"
  | string;

@Catch()
export class PlatformExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PlatformExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse();
    const mapped = mapPlatformError(error);
    const requestId = request.headers["x-request-id"]?.toString() || randomUUID();

    this.logger.error(
      JSON.stringify({
        requestId,
        route: request.originalUrl ?? request.url,
        platformUserId: request.user?.userId ?? null,
        platformRole: request.user?.platformRole ?? null,
        queryParams: sanitizeQuery(request.query),
        controllerResolved: true,
        serviceResolved: true,
        prismaQueryReached: isPrismaError(error),
        httpStatus: mapped.status,
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
        errorCode: mapped.code,
      }),
      error instanceof Error ? error.stack : undefined,
    );

    response.status(mapped.status).json({
      requestId,
      code: mapped.code,
      message: mapped.message,
    });
  }
}

function mapPlatformError(error: unknown): {
  status: number;
  code: PlatformErrorCode;
  message: string;
} {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();
    const body =
      typeof response === "object" && response ? (response as Record<string, unknown>) : {};
    const code = body.code;
    if (typeof code === "string") {
      return {
        status,
        code,
        message: safeMessage(
          body.message,
          "Nao foi possivel processar a requisicao de plataforma.",
        ),
      };
    }
    if (status === HttpStatus.NOT_FOUND) {
      return {
        status,
        code: "PLATFORM_RESOURCE_NOT_FOUND",
        message: safeMessage(body.message, "Recurso do plano de controle nao encontrado."),
      };
    }
    return {
      status,
      code:
        status === HttpStatus.BAD_REQUEST ? "PLATFORM_QUERY_INVALID" : "PLATFORM_UNEXPECTED_ERROR",
      message: safeMessage(body.message, "Nao foi possivel processar a requisicao de plataforma."),
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: "PLATFORM_QUERY_INVALID",
      message: "Consulta invalida para o plano de controle.",
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return {
        status: HttpStatus.NOT_FOUND,
        code: "PLATFORM_RESOURCE_NOT_FOUND",
        message: "Recurso do plano de controle nao encontrado.",
      };
    }
    if (["P1000", "P1001", "P1002", "P1017"].includes(error.code)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "PLATFORM_DATABASE_UNAVAILABLE",
        message: "Banco de dados indisponivel para o plano de controle.",
      };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "PLATFORM_UNEXPECTED_ERROR",
    message: "Erro seguro no plano de controle. Informe o requestId ao suporte.",
  };
}

function safeMessage(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" && value.trim() ? value : fallback;
}

function sanitizeQuery(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => !/token|secret|password|jwt|key/i.test(key)),
  );
}

function isPrismaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  );
}
