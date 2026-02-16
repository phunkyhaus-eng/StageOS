import { Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService
  ) {}

  async list(user: AuthUser) {
    return this.prisma.webhookEndpoint.findMany({
      where: {
        organisationId: user.organisationId,
        deletedAt: null
      },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(user: AuthUser, dto: CreateWebhookEndpointDto) {
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        organisationId: user.organisationId,
        url: dto.url,
        events: dto.events,
        secretHash: dto.secret,
        active: dto.active ?? true
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'webhook.create',
      entityType: 'WebhookEndpoint',
      entityId: endpoint.id,
      metadata: { url: endpoint.url, events: endpoint.events }
    });

    return {
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      active: endpoint.active,
      createdAt: endpoint.createdAt
    };
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: {
        id,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!existing) throw new NotFoundException('Webhook endpoint not found');

    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'webhook.delete',
      entityType: 'WebhookEndpoint',
      entityId: id
    });

    return { ok: true };
  }

  async emit(organisationId: string, eventType: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        organisationId,
        active: true,
        deletedAt: null,
        events: {
          has: eventType
        }
      }
    });

    const results: Array<{ endpointId: string; deliveryId: string; status: WebhookDeliveryStatus }> = [];

    for (const endpoint of endpoints) {
      const signature = crypto.createHash('sha256').update(`${eventType}:${endpoint.id}`).digest('hex');
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          organisationId,
          endpointId: endpoint.id,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          signature,
          status: WebhookDeliveryStatus.PENDING,
          attempts: 0,
          responseStatus: null,
          responseBody: null,
          nextAttemptAt: null
        }
      });

      await this.queue.enqueueWebhookDelivery(delivery.id);
      results.push({ endpointId: endpoint.id, deliveryId: delivery.id, status: delivery.status });
    }

    return {
      eventType,
      endpointCount: endpoints.length,
      results
    };
  }
}
