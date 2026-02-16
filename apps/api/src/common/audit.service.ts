import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    organisationId: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    diff?: unknown;
    metadata?: unknown;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        diff: input.diff as object | undefined,
        metadata: input.metadata as object | undefined
      }
    });
  }
}
