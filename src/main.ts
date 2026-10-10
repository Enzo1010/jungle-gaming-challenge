import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from './infrastructure/http/validation/validation-exception.factory.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
