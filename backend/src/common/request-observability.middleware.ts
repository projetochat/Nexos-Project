import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const logger = new Logger("HttpRequest");

export function requestObservability(request: Request, response: Response, next: NextFunction) {
  const suppliedRequestId = request.header("x-request-id")?.trim();
  const requestId =
    suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  const startedAt = process.hrtime.bigint();
  request.headers["x-request-id"] = requestId;
  response.setHeader("x-request-id", requestId);
  response.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.log({
      event: "http.request.completed",
      requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });
  next();
}
