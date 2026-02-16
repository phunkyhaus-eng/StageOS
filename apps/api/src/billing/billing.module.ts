import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FeatureGateGuard } from './feature-gate.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, FeatureGateGuard, AuditService],
  exports: [BillingService, FeatureGateGuard]
})
export class BillingModule {}
