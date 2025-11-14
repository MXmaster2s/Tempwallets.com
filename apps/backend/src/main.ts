import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with dynamic origins
  const allowedOrigins = [
    'http://localhost:3000', // Next.js web app
    'http://localhost:5555', // Prisma Studio
    'http://localhost:5173', // Vite (if you use it)
    'https://www.tempwallets.com', // Production frontend
    'https://tempwallets.com', // Production frontend without www
  ];

  // Add production frontend URL if set
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Get port from environment or use default
  const port = parseInt(process.env.PORT || '5005', 10);

  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📊 Health check available at: http://localhost:${port}/health`);
}
bootstrap();
