import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { PublicEventsController } from './public-events.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [ApiKeysController, PublicEventsController, WebhooksController],
  providers: [ApiKeysService, ApiKeyGuard, WebhooksService, AuditService],
  exports: [WebhooksService, ApiKeysService]
})
export class PublicApiModule {}
