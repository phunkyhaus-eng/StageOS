import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1e9;
        const route = req.route?.path ?? req.path;
        const status = String(res.statusCode);
        const labels = { method: req.method, route, status };

        this.metrics.httpRequestsTotal.inc(labels, 1);
        this.metrics.httpRequestDuration.observe(labels, duration);
      })
    );
  }
}
