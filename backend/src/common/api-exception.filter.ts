import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "../messaging/messaging.contracts";
import { randomUUID } from "node:crypto";

type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const response = context.getResponse();
    const requestId = request.headers["x-request-id"]?.toString() || randomUUID();
    const mapped = mapApiError(error);

    this.logger.error(
      JSON.stringify({
        requestId,
        method: request.method,
        route: request.originalUrl ?? request.url,
        status: mapped.status,
        code: mapped.code,
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
      }),
      error instanceof Error ? error.stack : undefined,
    );

    response.status(mapped.status).json({
      requestId,
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
    });
  }
}

export function mapApiError(error: unknown): ApiError {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();
    const body =
      typeof response === "object" && response ? (response as Record<string, unknown>) : {};
    const message = userMessage(body.message);
    return {
      status,
      code: typeof body.code === "string" ? body.code : errorCodeForStatus(status),
      message: message ?? messageForStatus(status),
      ...(message && Array.isArray(body.message) ? { details: body.message } : {}),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: HttpStatus.CONFLICT,
        code: "DUPLICATE_RECORD",
        message: "Já existe um registro com essas informações.",
      };
    }
    if (error.code === "P2025") {
      return {
        status: HttpStatus.NOT_FOUND,
        code: "RESOURCE_NOT_FOUND",
        message: "O registro não foi encontrado ou não está mais disponível.",
      };
    }
    if (["P1000", "P1001", "P1002", "P1017"].includes(error.code)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "DATABASE_UNAVAILABLE",
        message:
          "O serviço está temporariamente indisponível. Tente novamente em alguns instantes.",
      };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: "REQUEST_INVALID",
      message: "Não foi possível concluir a ação. Revise os dados informados e tente novamente.",
    };
  }

  if (error instanceof MessagingProviderError) {
    return mapMessagingProviderError(error);
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    message: "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.",
  };
}

function mapMessagingProviderError(error: MessagingProviderError): ApiError {
  if (
    error.code === MessagingErrorCode.INVALID_RECIPIENT ||
    error.code === MessagingErrorCode.INVALID_PROVIDER_PAYLOAD ||
    error.code === MessagingErrorCode.PROVIDER_VALIDATION_ERROR
  ) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: error.code,
      message:
        "O WhatsApp não aceitou os dados para criar o grupo. Revise os participantes e tente novamente.",
    };
  }

  if (error.code === MessagingErrorCode.RATE_LIMITED) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: error.code,
      message:
        "O WhatsApp está limitando temporariamente novas ações nesta instância. Aguarde alguns minutos e tente novamente.",
    };
  }

  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: error.code,
    message:
      "Não foi possível confirmar a criação do grupo no WhatsApp neste momento. Verifique a conexão da instância e tente novamente.",
  };
}

function userMessage(value: unknown) {
  const message = Array.isArray(value) ? null : typeof value === "string" ? value.trim() : null;
  if (!message || !isSafeMessage(message)) return null;
  return message;
}

function isSafeMessage(message: string) {
  return !/(internal( server)? error|erro interno|unexpected error|unknown error|prisma|stack trace)/i.test(
    message,
  );
}

function errorCodeForStatus(status: number) {
  if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.UNPROCESSABLE_ENTITY) {
    return "REQUEST_INVALID";
  }
  if (status === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
  if (status === HttpStatus.FORBIDDEN) return "FORBIDDEN";
  if (status === HttpStatus.NOT_FOUND) return "RESOURCE_NOT_FOUND";
  if (status === HttpStatus.CONFLICT) return "DUPLICATE_RECORD";
  if (status === HttpStatus.TOO_MANY_REQUESTS) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "REQUEST_ERROR";
}

function messageForStatus(status: number) {
  if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.UNPROCESSABLE_ENTITY) {
    return "Não foi possível concluir a ação. Revise os dados informados e tente novamente.";
  }
  if (status === HttpStatus.UNAUTHORIZED)
    return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === HttpStatus.FORBIDDEN) return "Você não possui permissão para realizar esta ação.";
  if (status === HttpStatus.NOT_FOUND)
    return "O registro não foi encontrado ou não está mais disponível.";
  if (status === HttpStatus.CONFLICT) return "Já existe um registro com essas informações.";
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return "Muitas solicitações em pouco tempo. Aguarde alguns instantes e tente novamente.";
  }
  if (status === HttpStatus.SERVICE_UNAVAILABLE) {
    return "O serviço está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  return "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.";
}
