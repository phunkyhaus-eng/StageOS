import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { StaffingController } from './staffing.controller';
import { StaffingEmailService } from './staffing-email.service';
import { StaffingPublicController } from './staffing-public.controller';
import { StaffingService } from './staffing.service';
import { StaffingTokenService } from './staffing-token.service';

@Module({
  controllers: [StaffingController, StaffingPublicController],
  providers: [
    StaffingService,
    StaffingEmailService,
    StaffingTokenService,
    ChangeLogService,
    AuditService
  ],
  exports: [StaffingService]
})
export class StaffingModule {}
