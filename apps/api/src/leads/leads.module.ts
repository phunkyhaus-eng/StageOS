import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [RbacModule],
  controllers: [LeadsController],
  providers: [LeadsService, AuditService, ChangeLogService]
})
export class LeadsModule {}
