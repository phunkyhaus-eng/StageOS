import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import { WebhookDeliveryStatus } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';

interface WebhookJobData {
  deliveryId: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redis = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
  private readonly connection = { url: config.redisUrl };

  private readonly webhookQueue = new Queue<WebhookJobData, unknown, string>('webhook-delivery', {
    connection: this.connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 500,
      removeOnFail: 2000
    }
  });

  private webhookWorker?: Worker<WebhookJobData, unknown, string>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.webhookWorker = new Worker<WebhookJobData>(
      'webhook-delivery',
      async (job) => this.processWebhook(job),
      {
        connection: this.connection,
        concurrency: 10
      }
    );

    this.webhookWorker.on('failed', (job, error) => {
      this.logger.warn(
        `Webhook delivery job failed (id=${job?.id ?? 'unknown'}): ${error.message}`
      );
    });
  }

  async onModuleDestroy() {
    await this.webhookWorker?.close();
    await this.webhookQueue.close();
    await this.redis.quit();
  }

  async enqueueWebhookDelivery(deliveryId: string) {
    await this.webhookQueue.add('deliver', { deliveryId });
  }

  async getQueueStats() {
    const counts = await this.webhookQueue.getJobCounts(
      'active',
      'completed',
      'delayed',
      'failed',
      'paused',
      'waiting'
    );

    return {
      webhookDelivery: counts
    };
  }

  async redisPing() {
    return this.redis.ping();
  }

  private async processWebhook(job: Job<WebhookJobData>) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: {
        endpoint: true
      }
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${job.data.deliveryId} no longer exists`);
      return;
    }

    if (!delivery.endpoint.active || delivery.endpoint.deletedAt) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          responseBody: 'Endpoint inactive'
        }
      });
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', delivery.endpoint.secretHash)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    let status: WebhookDeliveryStatus = WebhookDeliveryStatus.SUCCESS;
    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-stageos-event': delivery.eventType,
          'x-stageos-signature': signature,
          'x-stageos-timestamp': timestamp
        },
        body
      });

      responseStatus = response.status;
      responseBody = await response.text();

      if (!response.ok) {
        status = WebhookDeliveryStatus.FAILED;
      }
    } catch (error) {
      status = WebhookDeliveryStatus.FAILED;
      responseBody = error instanceof Error ? error.message : 'Delivery failed';
    }

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        signature,
        status,
        attempts: { increment: 1 },
        responseStatus,
        responseBody,
        nextAttemptAt:
          status === WebhookDeliveryStatus.FAILED
            ? new Date(Date.now() + 5 * 60 * 1000)
            : null
      }
    });

    if (status === WebhookDeliveryStatus.FAILED && delivery.attempts < 4) {
      await this.webhookQueue.add(
        'deliver',
        { deliveryId: delivery.id },
        {
          delay: 5 * 60 * 1000
        }
      );
    }
  }
}
