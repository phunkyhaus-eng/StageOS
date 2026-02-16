import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, AuditService],
  exports: [FeatureFlagsService]
})
export class FeatureFlagsModule {}
