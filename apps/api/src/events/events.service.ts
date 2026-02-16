import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import { AccessService } from '../rbac/access.service';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly changeLog: ChangeLogService
  ) {}

  async list(user: AuthUser, bandId: string, page = 1, pageSize = 20) {
    await this.access.ensureBandAccess(user, bandId);
    const { skip, take } = this.access.pagination(page, pageSize);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where: {
          organisationId: user.organisationId,
          bandId,
          deletedAt: null
        },
        orderBy: { startsAt: 'asc' },
        skip,
        take
      }),
      this.prisma.event.count({
        where: {
          organisationId: user.organisationId,
          bandId,
          deletedAt: null
        }
      })
    ]);

    return { items, total, page, pageSize: take };
  }

  async create(user: AuthUser, dto: CreateEventDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const created = await this.prisma.event.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        title: dto.title,
        type: dto.type,
        status: dto.status,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        venueName: dto.venueName,
        address: dto.address,
        mapUrl: dto.mapUrl,
        notes: dto.notes,
        version: 1
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'EVENT',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: { title: created.title }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'event.create',
      entityType: 'Event',
      entityId: created.id,
      diff: created
    });

    return created;
  }

  async getById(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        contacts: { include: { contact: true } },
        schedules: { where: { deletedAt: null }, orderBy: { startsAt: 'asc' } },
        tasks: { where: { deletedAt: null } },
        messages: { orderBy: { createdAt: 'desc' }, take: 100 },
        setlists: {
          where: { deletedAt: null },
          include: { items: { where: { deletedAt: null }, orderBy: { position: 'asc' } } }
        },
        invoices: { where: { deletedAt: null } },
        expenses: { where: { deletedAt: null } },
        payouts: { where: { deletedAt: null } },
        files: {
          include: {
            fileAsset: true
          }
        },
        availReqs: {
          where: { deletedAt: null },
          include: {
            responses: { where: { deletedAt: null }, include: { user: true } }
          }
        }
      }
    });

    if (!event) throw new NotFoundException('Event not found');
    await this.access.ensureBandAccess(user, event.bandId);

    return {
      ...event,
      settlement: {
        income: event.invoices.reduce((sum, i) => sum + Number(i.total), 0),
        expenses: event.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
        payouts: event.payouts.map((p) => ({
          id: p.id,
          userId: p.userId,
          type: p.type,
          amount: p.amount,
          percentage: p.percentage
        }))
      }
    };
  }

  async update(user: AuthUser, eventId: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organisationId: user.organisationId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException('Event not found');

    await this.access.ensureBandAccess(user, existing.bandId);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        version: { increment: 1 }
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: existing.bandId,
      entityType: 'EVENT',
      entityId: updated.id,
      action: 'update',
      version: updated.version,
      payload: { title: updated.title }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'event.update',
      entityType: 'Event',
      entityId: updated.id,
      diff: { before: existing, after: updated }
    });

    return updated;
  }

  async lockRoster(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!event) throw new NotFoundException('Event not found');
    if (event.rosterLocked) throw new ConflictException('Roster already locked');

    await this.access.ensureBandAccess(user, event.bandId);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        rosterLocked: true,
        version: { increment: 1 }
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'roster.locked',
      entityType: 'Event',
      entityId: eventId,
      metadata: { at: new Date().toISOString() }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: event.bandId,
      entityType: 'EVENT',
      entityId: updated.id,
      action: 'update',
      version: updated.version,
      payload: { rosterLocked: true }
    });

    return updated;
  }

  async softDelete(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organisationId: user.organisationId, deletedAt: null }
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.access.ensureBandAccess(user, event.bandId);

    const deleted = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 }
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: event.bandId,
      entityType: 'EVENT',
      entityId: eventId,
      action: 'delete',
      version: deleted.version
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'event.delete',
      entityType: 'Event',
      entityId: eventId
    });

    return { ok: true };
  }
}
