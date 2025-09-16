import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app/app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // 1️⃣ habilita CORS **antes de listen**
  app.enableCors({
    origin: "http://localhost:3000", // frontend Next.js
    credentials: true, // se usar cookies/token no header
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true })
  );

  await app.listen(process.env.PORT || 3000);

  console.log(
    `🚀 Save State API on http://localhost:${process.env.PORT || 1234}/api`
  );
}

bootstrap();
