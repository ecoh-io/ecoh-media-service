import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, params, query } = req;
    const user = req.user ? req.user.sub : 'Guest';

    const now = Date.now();
    this.logger.log(
      `Incoming Request: ${method} ${url} by ${user} | Body: ${JSON.stringify(
        body
      )} | Params: ${JSON.stringify(params)} | Query: ${JSON.stringify(query)}`
    );

    return next
      .handle()
      .pipe(
        tap(response =>
          this.logger.log(
            `Outgoing Response: ${method} ${url} | Response: ${JSON.stringify(
              response
            )} | Time: ${Date.now() - now}ms`
          )
        )
      );
  }
}
