import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { config } from './config';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { LeadsModule } from './leads/leads.module';
import { SongsModule } from './songs/songs.module';
import { SetlistsModule } from './setlists/setlists.module';
import { FinanceModule } from './finance/finance.module';
import { RbacModule } from './rbac/rbac.module';
import { SyncModule } from './sync/sync.module';
import { AvailabilityModule } from './availability/availability.module';
import { FilesModule } from './files/files.module';
import { ToursModule } from './tours/tours.module';
import { BillingModule } from './billing/billing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PluginsModule } from './plugins/plugins.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { CalendarModule } from './calendar/calendar.module';
import { ComplianceModule } from './compliance/compliance.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { BrandingModule } from './branding/branding.module';
import { PublicApiModule } from './public-api/public-api.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.isProd ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.refreshToken'
          ],
          remove: true
        },
        customProps: () => ({ service: 'stageos-api' })
      }
    }),
    ThrottlerModule.forRoot([
      {
        ttl: config.limits.rateLimitTtlSeconds * 1000,
        limit: config.limits.rateLimitPerMinute
      }
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    QueueModule,
    MetricsModule,
    RbacModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EventsModule,
    LeadsModule,
    SongsModule,
    SetlistsModule,
    FinanceModule,
    SyncModule,
    AvailabilityModule,
    FilesModule,
    ToursModule,
    BillingModule,
    AnalyticsModule,
    PluginsModule,
    FeatureFlagsModule,
    CalendarModule,
    ComplianceModule,
    DiagnosticsModule,
    BrandingModule,
    PublicApiModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor
    }
  ]
})
export class AppModule {}
