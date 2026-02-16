import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly metrics: MetricsService
  ) {}

  async healthSummary() {
    const [dbResult, redisPing, queueStats] = await Promise.all([
      this.prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`,
      this.queue.redisPing(),
      this.queue.getQueueStats()
    ]);

    return {
      db: dbResult[0]?.ok === 1 ? 'ok' : 'error',
      redis: redisPing,
      queues: queueStats,
      timestamp: new Date().toISOString()
    };
  }

  async adminDashboard(organisationId: string) {
    const [counts, recentAnomalies, queueStats, metricsSnapshot, storage] = await Promise.all([
      this.prisma.$transaction([
        this.prisma.user.count({ where: { organisationId, deletedAt: null } }),
        this.prisma.band.count({ where: { organisationId, deletedAt: null } }),
        this.prisma.event.count({ where: { organisationId, deletedAt: null } }),
        this.prisma.lead.count({ where: { organisationId, deletedAt: null } }),
        this.prisma.invoice.count({ where: { organisationId, deletedAt: null } }),
        this.prisma.webhookDelivery.count({
          where: {
            organisationId,
            status: 'FAILED',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        })
      ]),
      this.prisma.ipAnomaly.findMany({
        where: {
          organisationId
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      this.queue.getQueueStats(),
      this.metrics.snapshot(),
      this.prisma.storageUsageSnapshot.findFirst({
        where: { organisationId },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      totals: {
        users: counts[0],
        bands: counts[1],
        events: counts[2],
        leads: counts[3],
        invoices: counts[4],
        failedWebhookDeliveries24h: counts[5]
      },
      recentAnomalies,
      queueStats,
      latestStorageSnapshot: storage,
      metrics: metricsSnapshot
    };
  }
}
