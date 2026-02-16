import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from './change-log.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [RbacModule],
  controllers: [SyncController],
  providers: [SyncService, ChangeLogService, AuditService],
  exports: [SyncService, ChangeLogService]
})
export class SyncModule {}
