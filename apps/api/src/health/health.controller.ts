import { Controller, Get } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Controller('health')
export class HealthController {
  private readonly s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    }
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  @Get()
  async check(): Promise<{ status: string; db: string; redis: string; s3: string; time: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.queue.redisPing();

    let s3 = 'ok';
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    } catch {
      s3 = 'error';
    }

    return {
      status: redis === 'PONG' && s3 === 'ok' ? 'ok' : 'degraded',
      db: 'ok',
      redis,
      s3,
      time: new Date().toISOString()
    };
  }
}
