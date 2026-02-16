import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { config } from './config';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.isProd ? 'info' : 'debug',
        customProps: () => ({ service: 'stageos-worker' })
      }
    }),
    PrismaModule,
    QueueModule
  ]
})
export class WorkerModule {}
