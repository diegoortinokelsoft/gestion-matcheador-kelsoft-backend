import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/filters/app-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { createGlobalValidationPipe } from './common/utils/validation-pipe.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const logger = new Logger('Bootstrap');
  app.useLogger(logger);

  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalFilters(new AppExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseEnvelopeInterceptor(),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port);

  logger.log(`Backend listening on port ${port}`);
}

bootstrap();
