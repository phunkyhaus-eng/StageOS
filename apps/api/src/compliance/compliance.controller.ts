import { Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { ComplianceService } from './compliance.service';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('export')
  @Header('Content-Type', 'application/zip')
  @Header('Content-Disposition', 'attachment; filename="stageos-gdpr-export.zip"')
  export(@CurrentUser() user: AuthUser) {
    return this.compliance.exportOrganisationData(user);
  }

  @Post('delete-account')
  deleteAccount(@CurrentUser() user: AuthUser) {
    return this.compliance.deleteAccount(user);
  }

  @Get('backup-policy')
  backupPolicy() {
    return this.compliance.backupPolicy();
  }
}
