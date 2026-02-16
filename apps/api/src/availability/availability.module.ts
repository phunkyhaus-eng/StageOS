import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [RbacModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, ChangeLogService, AuditService],
  exports: [AvailabilityService]
})
export class AvailabilityModule {}
