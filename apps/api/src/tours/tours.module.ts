import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';

@Module({
  imports: [RbacModule],
  controllers: [ToursController],
  providers: [ToursService, ChangeLogService, AuditService],
  exports: [ToursService]
})
export class ToursModule {}
