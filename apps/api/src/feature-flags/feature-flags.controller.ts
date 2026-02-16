import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('feature-flags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @Permissions('manage:feature-flags')
  list(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.flags.list(user, userId);
  }

  @Post()
  @Permissions('manage:feature-flags')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertFeatureFlagDto) {
    return this.flags.upsert(user, dto);
  }

  @Post('evaluate')
  evaluate(@CurrentUser() user: AuthUser, @Body() dto: { keys: string[] }) {
    return this.flags.evaluateForUser(user.organisationId, user.id, dto.keys);
  }
}
