import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @Permissions('manage:webhooks')
  list(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(user);
  }

  @Post()
  @Permissions('manage:webhooks')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhooks.create(user, dto);
  }

  @Delete(':id')
  @Permissions('manage:webhooks')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.remove(user, id);
  }

  @Post('emit')
  @Permissions('manage:webhooks')
  emit(
    @CurrentUser() user: AuthUser,
    @Body() dto: { eventType: string; payload: Record<string, unknown> }
  ) {
    return this.webhooks.emit(user.organisationId, dto.eventType, dto.payload ?? {});
  }
}
