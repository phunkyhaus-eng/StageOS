import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, AuditService]
})
export class ComplianceModule {}
