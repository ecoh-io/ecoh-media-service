// src/logger/logger.service.ts

import {
  Injectable,
  Scope,
  LoggerService as NestLoggerService,
} from '@nestjs/common';
import * as winston from 'winston';
import { createNamespace, getNamespace } from 'cls-hooked';
import { exceptionHandlingTransports, logger } from './logger.config';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger = logger;
  private readonly namespace =
    getNamespace('request') || createNamespace('request');

  private static handlersAttached = false;

  constructor() {
    if (!LoggerService.handlersAttached) {
      this.logger.exceptions.handle(...exceptionHandlingTransports);
      this.logger.rejections.handle(...exceptionHandlingTransports);
      LoggerService.handlersAttached = true;
    }
  }

  private getRequestId(): string {
    return this.namespace.get('requestId') || 'N/A';
  }

  log(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.info(message, {
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
    this.logger.error(message, {
      trace,
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  warn(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.warn(message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  debug(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.debug(message, {
      context,
      requestId: this.getRequestId(),
      ...meta,
    });
  }

  verbose(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.verbose(message, {
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

  setLogLevels(levels: string[]) {
    this.logger.level = levels[0];
  }
}
