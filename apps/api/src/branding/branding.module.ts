import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

@Module({
  controllers: [BrandingController],
  providers: [BrandingService, AuditService]
})
export class BrandingModule {}
