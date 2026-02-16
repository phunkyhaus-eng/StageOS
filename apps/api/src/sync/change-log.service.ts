import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChangeLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ChangeLog is append-only and cursor-based for robust sync.
   * Using an explicit log avoids missed changes from clock skew or coarse updatedAt polling.
   */
  async append(input: {
    organisationId: string;
    bandId: string;
    entityType: string;
    entityId: string;
    action: string;
    version: number;
    payload?: Record<string, unknown>;
  }) {
    return this.prisma.changeLog.create({
      data: {
        organisationId: input.organisationId,
        bandId: input.bandId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        version: input.version,
        payload: input.payload as Prisma.InputJsonValue | undefined
      }
    });
  }
}
