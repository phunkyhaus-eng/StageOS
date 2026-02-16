import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [RbacModule],
  controllers: [FilesController],
  providers: [FilesService, ChangeLogService, AuditService],
  exports: [FilesService]
})
export class FilesModule {}
