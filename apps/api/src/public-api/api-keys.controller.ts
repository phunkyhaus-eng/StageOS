import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeysService } from './api-keys.service';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @Permissions('manage:api-keys')
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user);
  }

  @Post()
  @Permissions('manage:api-keys')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, dto);
  }

  @Delete(':id')
  @Permissions('manage:api-keys')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apiKeys.revoke(user, id);
  }
}
