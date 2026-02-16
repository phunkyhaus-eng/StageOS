import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Permissions('read:analytics')
  overview(
    @CurrentUser() user: AuthUser,
    @Query('bandId') bandId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.analytics.overview(user, { bandId, from, to });
  }

  @Get('availability')
  @Permissions('read:analytics')
  availability(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.analytics.availabilityReliability(user, bandId);
  }

  @Get('usage')
  @Permissions('read:analytics')
  usage(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.analytics.featureUsage(user, bandId);
  }

  @Post('track')
  track(
    @CurrentUser() user: AuthUser,
    @Body() dto: { bandId?: string; feature: string; action: string; metadata?: Record<string, unknown> }
  ) {
    return this.analytics.trackFeatureUsage({
      organisationId: user.organisationId,
      userId: user.id,
      bandId: dto.bandId,
      feature: dto.feature,
      action: dto.action,
      metadata: dto.metadata
    });
  }
}
