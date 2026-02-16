import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import { EncryptionService } from '../common/encryption.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [RbacModule],
  controllers: [FinanceController],
  providers: [FinanceService, ChangeLogService, AuditService, EncryptionService],
  exports: [FinanceService]
})
export class FinanceModule {}
