import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { DiagnosticsService } from './diagnostics.service';

@ApiTags('diagnostics')
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get('health')
  health() {
    return this.diagnostics.healthSummary();
  }

  @Get('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  admin(@CurrentUser() user: AuthUser) {
    return this.diagnostics.adminDashboard(user.organisationId);
  }
}
