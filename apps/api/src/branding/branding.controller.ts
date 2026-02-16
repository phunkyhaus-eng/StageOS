import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { UpsertBrandingDto } from './dto/upsert-branding.dto';
import { BrandingService } from './branding.service';

@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get('resolve')
  resolve(@Query('host') host: string) {
    return this.branding.resolve(host);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('write:events')
  list(@CurrentUser() user: AuthUser) {
    return this.branding.list(user);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('write:events')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertBrandingDto) {
    return this.branding.upsert(user, dto);
  }
}
