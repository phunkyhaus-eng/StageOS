import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { EventStatus, EventType, LeadStage, Prisma } from '@prisma/client';
import { setlistOperationSchema, syncPushSchema } from '@stageos/shared';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { mergeSetlistOps } from '../setlists/merge';
import { ChangeLogService } from './change-log.service';
import { SyncPullDto } from './dto/sync-pull.dto';
import { SyncOperationInput, SyncPushDto } from './dto/sync-push.dto';

export interface SyncAck {
  clientId: string;
  entity: string;
  entityId: string;
  action: string;
  version: number;
  mergePatch?: unknown;
}

export interface SyncConflict {
  clientId: string;
  entity: string;
  entityId: string;
  reason: string;
  serverVersion?: number;
  serverRecord?: unknown;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changeLog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  private async upsertDevice(user: AuthUser, input: { id: string; platform?: string; name?: string }) {
    return this.prisma.device.upsert({
      where: { id: input.id },
      update: {
        platform: input.platform ?? 'unknown',
        name: input.name,
        userId: user.id,
        organisationId: user.organisationId,
        lastSeenAt: new Date()
      },
      create: {
        id: input.id,
        organisationId: user.organisationId,
        userId: user.id,
        platform: input.platform ?? 'unknown',
        name: input.name,
        lastSeenAt: new Date()
      }
    });
  }

  async pull(user: AuthUser, dto: SyncPullDto) {
    await this.access.ensureBandAccess(user, dto.bandId);
    await this.upsertDevice(user, { id: dto.deviceId, platform: dto.platform, name: dto.deviceName });

    let cursorLog: { id: string; createdAt: Date } | null = null;
    if (dto.cursor) {
      cursorLog = await this.prisma.changeLog.findFirst({
        where: {
          id: dto.cursor,
          organisationId: user.organisationId,
          bandId: dto.bandId
        },
        select: { id: true, createdAt: true }
      });
    }

    const limit = Math.min(Math.max(dto.limit ?? 200, 1), 1000);
    const changes = await this.prisma.changeLog.findMany({
      where: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        ...(cursorLog
          ? {
              OR: [
                { createdAt: { gt: cursorLog.createdAt } },
                {
                  createdAt: cursorLog.createdAt,
                  id: { gt: cursorLog.id }
                }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit
    });

    const nextCursor = changes.at(-1)?.id ?? dto.cursor ?? null;
    await this.prisma.syncCursor.upsert({
      where: { deviceId_bandId: { deviceId: dto.deviceId, bandId: dto.bandId } },
      update: { lastCursor: nextCursor },
      create: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        deviceId: dto.deviceId,
        lastCursor: nextCursor
      }
    });

    return {
      cursor: nextCursor,
      changes,
      hasMore: changes.length === limit
    };
  }

  async push(user: AuthUser, dto: SyncPushDto) {
    const parsed = syncPushSchema.parse(dto);
    await this.access.ensureBandAccess(user, parsed.bandId);
    await this.upsertDevice(user, { id: parsed.deviceId, platform: dto.platform, name: dto.deviceName });

    const ack: SyncAck[] = [];
    const conflicts: SyncConflict[] = [];

    for (const operation of parsed.operations) {
      try {
        const result = await this.applyOperation(user, operation as SyncOperationInput);
        if (!result) {
          conflicts.push({
            clientId: operation.clientId,
            entity: operation.entity,
            entityId: operation.entityId,
            reason: 'Unsupported operation'
          });
          continue;
        }

        ack.push({
          clientId: operation.clientId,
          entity: operation.entity,
          entityId: operation.entityId,
          action: operation.operation,
          version: result.version,
          mergePatch: result.mergePatch
        });

        await this.changeLog.append({
          organisationId: user.organisationId,
          bandId: operation.bandId,
          entityType: operation.entity,
          entityId: operation.entityId,
          action: operation.operation,
          version: result.version,
          payload: result.payload
        });
      } catch (error) {
        if (error instanceof ConflictException) {
          const payload = error.getResponse() as { message?: string; serverVersion?: number; serverRecord?: unknown };
          conflicts.push({
            clientId: operation.clientId,
            entity: operation.entity,
            entityId: operation.entityId,
            reason: payload.message ?? 'Conflict',
            serverVersion: payload.serverVersion,
            serverRecord: payload.serverRecord
          });
        } else if (error instanceof NotFoundException) {
          conflicts.push({
            clientId: operation.clientId,
            entity: operation.entity,
            entityId: operation.entityId,
            reason: error.message
          });
        } else {
          throw error;
        }
      }
    }

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'sync.push',
      entityType: 'SyncBatch',
      entityId: parsed.deviceId,
      metadata: {
        accepted: ack.length,
        conflicts: conflicts.length,
        bandId: parsed.bandId
      }
    });

    return {
      accepted: ack,
      conflicts
    };
  }

  async merge(user: AuthUser, input: { bandId: string; operation: SyncOperationInput }) {
    await this.access.ensureBandAccess(user, input.bandId);
    const result = await this.applyOperation(user, input.operation);
    if (!result) {
      throw new BadRequestException('Merge operation is not supported');
    }

    return result;
  }

  private assertVersion(currentVersion: number, baseVersion: number | undefined, serverRecord: unknown): void {
    if (baseVersion === undefined) return;
    if (baseVersion !== currentVersion) {
      throw new ConflictException({
        message: 'Version mismatch',
        serverVersion: currentVersion,
        serverRecord
      });
    }
  }

  private mapEventCreatePayload(payload: Record<string, unknown>, bandId: string) {
    const startsAt = payload.startsAt ? new Date(String(payload.startsAt)) : new Date();
    const endsAt = payload.endsAt
      ? new Date(String(payload.endsAt))
      : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

    return {
      bandId,
      title: String(payload.title ?? 'Untitled Event'),
      type: (payload.type as EventType) ?? EventType.GIG,
      status: (payload.status as EventStatus) ?? EventStatus.PLANNED,
      startsAt,
      endsAt,
      venueName: payload.venueName ? String(payload.venueName) : null,
      address: payload.address ? String(payload.address) : null,
      mapUrl: payload.mapUrl ? String(payload.mapUrl) : null,
      notes: payload.notes ? String(payload.notes) : null,
      scheduleJson: payload.scheduleJson ?? Prisma.JsonNull,
      checklistJson: payload.checklistJson ?? Prisma.JsonNull,
      rosterLocked: Boolean(payload.rosterLocked ?? false)
    };
  }

  private async applyOperation(user: AuthUser, operation: SyncOperationInput) {
    const payload = (operation.payload ?? {}) as Record<string, unknown>;

    if (operation.entity === 'EVENT') {
      if (operation.operation === 'create') {
        const create = this.mapEventCreatePayload(payload, operation.bandId);
        const created = await this.prisma.event.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            version: 1,
            ...create
          }
        });
        return { version: created.version, payload: { title: created.title } };
      }

      const existing = await this.prisma.event.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) {
        throw new NotFoundException('Event not found');
      }
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.event.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.event.update({
        where: { id: existing.id },
        data: {
          title: payload.title ? String(payload.title) : undefined,
          type: payload.type ? (payload.type as EventType) : undefined,
          status: payload.status ? (payload.status as EventStatus) : undefined,
          startsAt: payload.startsAt ? new Date(String(payload.startsAt)) : undefined,
          endsAt: payload.endsAt ? new Date(String(payload.endsAt)) : undefined,
          venueName: payload.venueName ? String(payload.venueName) : undefined,
          address: payload.address ? String(payload.address) : undefined,
          mapUrl: payload.mapUrl ? String(payload.mapUrl) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          scheduleJson: payload.scheduleJson as Prisma.InputJsonValue | undefined,
          checklistJson: payload.checklistJson as Prisma.InputJsonValue | undefined,
          rosterLocked: payload.rosterLocked !== undefined ? Boolean(payload.rosterLocked) : undefined,
          version: { increment: 1 }
        }
      });
      return { version: updated.version, payload: { title: updated.title } };
    }

    if (operation.entity === 'LEAD') {
      if (operation.operation === 'create') {
        const created = await this.prisma.lead.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            name: String(payload.name ?? 'Untitled Lead'),
            stage: (payload.stage as LeadStage) ?? LeadStage.LEAD,
            contactName: payload.contactName ? String(payload.contactName) : null,
            contactEmail: payload.contactEmail ? String(payload.contactEmail) : null,
            notes: payload.notes ? String(payload.notes) : null,
            version: 1
          }
        });
        return { version: created.version, payload: { stage: created.stage } };
      }

      const existing = await this.prisma.lead.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Lead not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.lead.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: payload.name ? String(payload.name) : undefined,
          stage: payload.stage ? (payload.stage as LeadStage) : undefined,
          contactName: payload.contactName ? String(payload.contactName) : undefined,
          contactEmail: payload.contactEmail ? String(payload.contactEmail) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          expectedDate: payload.expectedDate ? new Date(String(payload.expectedDate)) : undefined,
          expectedFee: payload.expectedFee ? Number(payload.expectedFee) : undefined,
          version: { increment: 1 }
        }
      });
      return { version: updated.version, payload: { stage: updated.stage } };
    }

    if (operation.entity === 'SETLIST') {
      if (operation.operation === 'create') {
        const created = await this.prisma.setlist.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            eventId: payload.eventId ? String(payload.eventId) : null,
            name: String(payload.name ?? 'Untitled Setlist'),
            locked: Boolean(payload.locked ?? false),
            version: 1
          }
        });
        return { version: created.version, payload: { name: created.name } };
      }

      const existing = await this.prisma.setlist.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Setlist not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.setlist.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      if (operation.operation === 'setlistOps') {
        const rawOps = operation.setlistOps ?? [];
        const operations = rawOps.map((op) => setlistOperationSchema.parse(op));

        const existingItems = await this.prisma.setlistItem.findMany({
          where: {
            setlistId: existing.id,
            organisationId: user.organisationId,
            deletedAt: null
          },
          orderBy: { position: 'asc' }
        });

        const merged = mergeSetlistOps(
          existingItems.map((item) => ({
            id: item.id,
            songVersionId: item.songVersionId,
            notes: item.notes,
            durationSec: item.durationSec
          })),
          operations,
          operation.baseVersion !== undefined && operation.baseVersion !== existing.version
        );

        const updated = await this.prisma.$transaction(async (tx) => {
          await tx.setlistItem.deleteMany({ where: { setlistId: existing.id } });

          for (let i = 0; i < merged.items.length; i += 1) {
            const item = merged.items[i];
            if (!item) continue;
            await tx.setlistItem.create({
              data: {
                id: item.id,
                organisationId: user.organisationId,
                bandId: operation.bandId,
                setlistId: existing.id,
                songVersionId: item.songVersionId,
                position: i + 1,
                notes: item.notes,
                durationSec: item.durationSec,
                version: 1
              }
            });
          }

          return tx.setlist.update({
            where: { id: existing.id },
            data: {
              totalDurationSec: merged.items.reduce((sum, item) => sum + (item.durationSec ?? 0), 0),
              version: { increment: 1 }
            }
          });
        });

        return {
          version: updated.version,
          payload: merged.mergePatch as Record<string, unknown>,
          mergePatch: merged.mergePatch
        };
      }

      const updated = await this.prisma.setlist.update({
        where: { id: existing.id },
        data: {
          name: payload.name ? String(payload.name) : undefined,
          locked: payload.locked !== undefined ? Boolean(payload.locked) : undefined,
          version: { increment: 1 }
        }
      });

      return { version: updated.version, payload: { name: updated.name } };
    }

    if (operation.entity === 'INVOICE') {
      if (operation.operation === 'create') {
        const created = await this.prisma.invoice.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            eventId: payload.eventId ? String(payload.eventId) : null,
            leadId: payload.leadId ? String(payload.leadId) : null,
            invoiceNumber: String(payload.invoiceNumber ?? `INV-${Date.now()}`),
            status: String(payload.status ?? 'DRAFT'),
            currency: String(payload.currency ?? 'USD'),
            issuedAt: payload.issuedAt ? new Date(String(payload.issuedAt)) : null,
            dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : null,
            subtotal: Number(payload.subtotal ?? payload.total ?? 0),
            total: Number(payload.total ?? 0),
            notes: payload.notes ? String(payload.notes) : null,
            version: 1
          }
        });
        return { version: created.version, payload: { invoiceNumber: created.invoiceNumber } };
      }

      const existing = await this.prisma.invoice.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Invoice not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.invoice.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.invoice.update({
        where: { id: existing.id },
        data: {
          status: payload.status ? String(payload.status) : undefined,
          currency: payload.currency ? String(payload.currency) : undefined,
          issuedAt: payload.issuedAt ? new Date(String(payload.issuedAt)) : undefined,
          dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : undefined,
          paidAt: payload.paidAt ? new Date(String(payload.paidAt)) : undefined,
          subtotal: payload.subtotal ? Number(payload.subtotal) : undefined,
          total: payload.total ? Number(payload.total) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          version: { increment: 1 }
        }
      });

      return { version: updated.version, payload: { status: updated.status } };
    }

    if (operation.entity === 'EXPENSE') {
      if (operation.operation === 'create') {
        const created = await this.prisma.expense.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            eventId: payload.eventId ? String(payload.eventId) : null,
            category: String(payload.category ?? 'General'),
            description: String(payload.description ?? 'Expense'),
            amount: Number(payload.amount ?? 0),
            currency: String(payload.currency ?? 'USD'),
            spentAt: payload.spentAt ? new Date(String(payload.spentAt)) : new Date(),
            notes: payload.notes ? String(payload.notes) : null,
            version: 1
          }
        });

        return { version: created.version, payload: { amount: created.amount.toString() } };
      }

      const existing = await this.prisma.expense.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Expense not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.expense.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.expense.update({
        where: { id: existing.id },
        data: {
          category: payload.category ? String(payload.category) : undefined,
          description: payload.description ? String(payload.description) : undefined,
          amount: payload.amount ? Number(payload.amount) : undefined,
          currency: payload.currency ? String(payload.currency) : undefined,
          spentAt: payload.spentAt ? new Date(String(payload.spentAt)) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          version: { increment: 1 }
        }
      });

      return { version: updated.version, payload: { amount: updated.amount.toString() } };
    }

    if (operation.entity === 'PAYOUT') {
      if (operation.operation === 'create') {
        const created = await this.prisma.payout.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            eventId: payload.eventId ? String(payload.eventId) : null,
            userId: payload.userId ? String(payload.userId) : null,
            type: payload.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
            amount: payload.amount ? Number(payload.amount) : null,
            percentage: payload.percentage ? Number(payload.percentage) : null,
            currency: String(payload.currency ?? 'USD'),
            notes: payload.notes ? String(payload.notes) : null,
            version: 1
          }
        });

        return { version: created.version, payload: { type: created.type } };
      }

      const existing = await this.prisma.payout.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Payout not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.payout.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.payout.update({
        where: { id: existing.id },
        data: {
          type: payload.type ? (payload.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED') : undefined,
          amount: payload.amount ? Number(payload.amount) : undefined,
          percentage: payload.percentage ? Number(payload.percentage) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          currency: payload.currency ? String(payload.currency) : undefined,
          version: { increment: 1 }
        }
      });

      return { version: updated.version, payload: { type: updated.type } };
    }

    if (operation.entity === 'AVAILABILITY_RESPONSE') {
      if (operation.operation === 'create') {
        const created = await this.prisma.availabilityResponse.create({
          data: {
            id: operation.entityId,
            organisationId: user.organisationId,
            bandId: operation.bandId,
            availabilityRequestId: String(payload.availabilityRequestId),
            userId: payload.userId ? String(payload.userId) : user.id,
            response: (payload.response as 'PENDING' | 'YES' | 'NO' | 'MAYBE') ?? 'PENDING',
            notes: payload.notes ? String(payload.notes) : null,
            version: 1
          }
        });

        return { version: created.version, payload: { response: created.response } };
      }

      const existing = await this.prisma.availabilityResponse.findFirst({
        where: {
          id: operation.entityId,
          organisationId: user.organisationId,
          bandId: operation.bandId,
          deletedAt: null
        }
      });
      if (!existing) throw new NotFoundException('Availability response not found');
      this.assertVersion(existing.version, operation.baseVersion, existing);

      if (operation.operation === 'delete') {
        const deleted = await this.prisma.availabilityResponse.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        });
        return { version: deleted.version, payload: { deleted: true } };
      }

      const updated = await this.prisma.availabilityResponse.update({
        where: { id: existing.id },
        data: {
          response: payload.response
            ? (payload.response as 'PENDING' | 'YES' | 'NO' | 'MAYBE')
            : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          version: { increment: 1 }
        }
      });

      return { version: updated.version, payload: { response: updated.response } };
    }

    return null;
  }
}
