import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe, LogLevel } from '@nestjs/common';
import { TraceIdInterceptor } from './common/trace-id.interceptor.js';

async function bootstrap() {
  // Configure logger based on environment
  const logLevels: LogLevel[] = process.env.LOG_LEVEL
    ? (process.env.LOG_LEVEL.split(',') as LogLevel[])
    : process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });

  // Add trace ID interceptor globally
  app.useGlobalInterceptors(new TraceIdInterceptor());

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
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow all Vercel preview deployments
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      
      // Block all other origins
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
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

  // Production-ready logging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🚀 Application is running on: http://localhost:${port}`);
    console.log(
      `📊 Health check available at: http://localhost:${port}/health`,
    );
  }
}
bootstrap();
