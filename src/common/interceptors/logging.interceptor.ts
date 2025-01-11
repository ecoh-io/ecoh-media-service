import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, params, query } = req;
    const user = req.user ? req.user.sub : 'Guest';

    const now = Date.now();
    this.logger.info(
      `Incoming Request: ${method} ${url} by ${user} | Body: ${JSON.stringify(
        body
      )} | Params: ${JSON.stringify(params)} | Query: ${JSON.stringify(query)}`
    );

    return next
      .handle()
      .pipe(
        tap(response =>
          this.logger.info(
            `Outgoing Response: ${method} ${url} | Response: ${JSON.stringify(
              response
            )} | Time: ${Date.now() - now}ms`
          )
        )
      );
  }
}
