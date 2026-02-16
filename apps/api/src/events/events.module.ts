import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RbacModule],
  controllers: [EventsController],
  providers: [EventsService, AuditService, ChangeLogService],
  exports: [EventsService]
})
export class EventsModule {}
