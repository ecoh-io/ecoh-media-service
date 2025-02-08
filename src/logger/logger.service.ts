// src/logger/logger.service.ts

import {
  Injectable,
  Scope,
  LoggerService as NestLoggerService,
} from '@nestjs/common';
import * as winston from 'winston';
import { winstonConfig, exceptionHandlingTransports } from './logger.config';
import { createNamespace, getNamespace } from 'cls-hooked';

@Injectable({ scope: Scope.TRANSIENT }) // Transient scope for per-request context
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;
  private readonly namespace =
    getNamespace('request') || createNamespace('request');

  constructor() {
    this.logger = winston.createLogger(winstonConfig);

    // Handle uncaught exceptions and rejections
    this.logger.exceptions.handle(...exceptionHandlingTransports);
    this.logger.rejections.handle(...exceptionHandlingTransports);
  }

  // Retrieve current request ID from CLS namespace
  private getRequestId(): string {
    return this.namespace.get('requestId') || 'N/A';
  }

  log(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('info', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, any>
  ) {
    this.logger.log('error', message, {
      trace,
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  warn(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('warn', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  debug(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('debug', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  verbose(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('info', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  fatal(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('fatal', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  trace(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.log('trace', message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  // Implement Nest's LoggerService method
  setLogLevels(levels: string[]) {
    this.logger.level = levels[0];
  }
}
