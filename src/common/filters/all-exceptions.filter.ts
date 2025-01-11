import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const timestamp = new Date().toISOString();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    if (!(exception instanceof HttpException)) {
      // Log non-HTTP exceptions as errors
      this.logger.error(`Exception thrown: ${exception}`, {
        timestamp,
        path: request.url,
        method: request.method,
      });
    } else {
      // Log HTTP exceptions with appropriate level
      const exceptionResponse = exception.getResponse();
      const errorMessage =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message;

      if (status >= 500) {
        this.logger.error(`HTTP ${status} - ${errorMessage}`, {
          timestamp,
          path: request.url,
          method: request.method,
        });
      } else {
        this.logger.warn(`HTTP ${status} - ${errorMessage}`, {
          timestamp,
          path: request.url,
          method: request.method,
        });
      }
    }

    response.status(status).json({
      timestamp,
      path: request.url,
      method: request.method,
      status,
      message,
    });
  }
}
