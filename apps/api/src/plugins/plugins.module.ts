import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

@Module({
  controllers: [PluginsController],
  providers: [PluginsService, AuditService],
  exports: [PluginsService]
})
export class PluginsModule {}
