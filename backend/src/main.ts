import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const bodyLimit = config.get<string>("NEXOS_HTTP_BODY_LIMIT") ?? "100mb";

  app.use(helmet());
  app.useBodyParser("json", { limit: bodyLimit });
  app.useBodyParser("urlencoded", { extended: true, limit: bodyLimit });
  const allowedOrigins = (config.get<string>("FRONTEND_ORIGIN") ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("api");

  const port = config.get<number>("PORT") ?? 3001;
  const host = config.get<string>("BACKEND_HOST") ?? config.get<string>("HOST") ?? "0.0.0.0";
  await app.listen(port, host);
}

bootstrap();
