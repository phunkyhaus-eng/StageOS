import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class FeatureUsageInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      path?: string;
      user?: {
        id: string;
        organisationId: string;
      };
      query?: { bandId?: string };
    }>();

    return next.handle().pipe(
      tap(() => {
        if (!req.user) return;

        const route = req.route?.path ?? req.path ?? 'unknown';
        const segments = route
          .split('/')
          .filter(Boolean)
          .map((part) => (part.startsWith(':') ? '{id}' : part));
        const feature = segments[0] ?? 'core';

        void this.analytics.trackFeatureUsage({
          organisationId: req.user.organisationId,
          userId: req.user.id,
          bandId: req.query?.bandId,
          feature,
          action: req.method?.toUpperCase() ?? 'GET',
          metadata: {
            route
          }
        });
      })
    );
  }
}
