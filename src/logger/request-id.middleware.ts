// src/logger/request-id.middleware.ts

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createNamespace } from 'cls-hooked';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private namespace = createNamespace('request');

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = uuidv4();
    this.namespace.run(() => {
      this.namespace.set('requestId', requestId);
      req.headers['x-request-id'] = requestId; // Optionally set it in headers
      next();
    });
  }
}
