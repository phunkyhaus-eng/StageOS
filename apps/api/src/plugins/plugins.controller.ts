import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { UpsertPluginDto } from './dto/upsert-plugin.dto';
import { PluginsService } from './plugins.service';

@ApiTags('plugins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  @Permissions('manage:plugins')
  list(@CurrentUser() user: AuthUser) {
    return this.plugins.list(user);
  }

  @Post()
  @Permissions('manage:plugins')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertPluginDto) {
    return this.plugins.upsert(user, dto);
  }

  @Post(':id/disable')
  @Permissions('manage:plugins')
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plugins.disable(user, id);
  }

  @Post('emit')
  @Permissions('manage:plugins')
  emit(
    @CurrentUser() user: AuthUser,
    @Body() dto: { hook: string; payload: Record<string, unknown> }
  ) {
    return this.plugins.emitForUser(user, dto.hook, dto.payload ?? {});
  }

  @Get('executions')
  @Permissions('manage:plugins')
  executions(@CurrentUser() user: AuthUser, @Query('pluginId') pluginId?: string) {
    return this.plugins.executionHistory(user, pluginId);
  }
}
