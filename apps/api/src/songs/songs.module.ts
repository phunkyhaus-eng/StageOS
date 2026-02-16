import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';

@Module({
  imports: [RbacModule],
  controllers: [SongsController],
  providers: [SongsService, ChangeLogService, AuditService]
})
export class SongsModule {}
