import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import { SetlistsController } from './setlists.controller';
import { SetlistsService } from './setlists.service';

@Module({
  imports: [RbacModule],
  controllers: [SetlistsController],
  providers: [SetlistsService, ChangeLogService, AuditService],
  exports: [SetlistsService]
})
export class SetlistsModule {}
