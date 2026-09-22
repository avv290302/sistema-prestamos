import "dotenv/config";

import { ValidationPipe } from "@nestjs/common";

import { NestFactory } from "@nestjs/core";

import cookieParser = require("cookie-parser");

import { rateLimit } from "express-rate-limit";

import { AppModule } from "./app.module";

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.use(cookieParser());

  app.useGlobalPipes(

    new ValidationPipe({

      whitelist: true,

      forbidNonWhitelisted: true,

      transform: true,

      validationError: {

        target: false,

        value: false,

      },

    }),

  );

  app.enableCors({

    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",

    credentials: true,

  });

  app.use(

    "/auth/login",

    rateLimit({

      windowMs: 15 * 60 * 1000,

      limit: 10,

      standardHeaders: "draft-8",

      legacyHeaders: false,

      message: {

        statusCode: 429,

        message: "Demasiados intentos. Intenta nuevamente en 15 minutos.",

      },

    }),

  );
const port = Number(process.env.PORT) || 10000;

console.log(`PORT recibido de Render: ${process.env.PORT}`);
console.log(`Intentando escuchar en 0.0.0.0:${port}`);

await app.listen(port, "0.0.0.0");

console.log(`✅ API escuchando correctamente en 0.0.0.0:${port}`);

}

void bootstrap();