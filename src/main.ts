// src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { LoggerService } from './logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = await app.resolve(LoggerService);

  // Security Middlewares
  app.use(helmet());

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global Validation Pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger Setup
  if (configService.get<string>('nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Media Service API')
      .setDescription('API documentation for the User Service')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

  app.getHttpAdapter().get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  // Start the application
  const port = configService.get<number>('port');
  await app.listen(port!);
  logger.log(`Media service is running on port ${port}`);
}
bootstrap();
