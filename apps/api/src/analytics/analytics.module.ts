import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RbacModule } from '../rbac/rbac.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FeatureUsageInterceptor } from './feature-usage.interceptor';

@Module({
  imports: [RbacModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: FeatureUsageInterceptor
    }
  ],
  exports: [AnalyticsService]
})
export class AnalyticsModule {}
