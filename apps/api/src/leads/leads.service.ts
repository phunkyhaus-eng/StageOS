import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStage } from '@prisma/client';
import { AccessService } from '../rbac/access.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../common/audit.service';
import { ChangeLogService } from '../sync/change-log.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly changelog: ChangeLogService
  ) {}

  async listBoard(user: AuthUser, bandId: string, query?: string) {
    await this.access.ensureBandAccess(user, bandId);

    const where = {
      organisationId: user.organisationId,
      bandId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' as const } },
              { contactName: { contains: query, mode: 'insensitive' as const } },
              { contactEmail: { contains: query, mode: 'insensitive' as const } }
            ]
          }
        : {})
    };

    const leads = await this.prisma.lead.findMany({
      where,
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }]
    });

    const board = Object.values(LeadStage).reduce<Record<string, typeof leads>>((acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.stage === stage);
      return acc;
    }, {});

    return board;
  }

  async create(user: AuthUser, dto: CreateLeadDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const created = await this.prisma.lead.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        name: dto.name,
        stage: dto.stage,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        notes: dto.notes
      }
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId: created.id,
        message: 'Lead created',
        meta: { by: user.id }
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'LEAD',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: { name: created.name, stage: created.stage }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'lead.create',
      entityType: 'Lead',
      entityId: created.id
    });

    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateLeadDto) {
    const existing = await this.prisma.lead.findFirst({
      where: { id, organisationId: user.organisationId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException('Lead not found');

    await this.access.ensureBandAccess(user, existing.bandId);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...dto,
        version: { increment: 1 }
      }
    });

    if (dto.stage && dto.stage !== existing.stage) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: id,
          message: `Stage moved: ${existing.stage} -> ${dto.stage}`,
          meta: { by: user.id }
        }
      });
    }

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: existing.bandId,
      entityType: 'LEAD',
      entityId: id,
      action: 'update',
      version: updated.version,
      payload: { stage: updated.stage }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'lead.update',
      entityType: 'Lead',
      entityId: id,
      diff: { before: existing, after: updated }
    });

    return updated;
  }

  async convertToEvent(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organisationId: user.organisationId, deletedAt: null }
    });
    if (!lead) throw new NotFoundException('Lead not found');

    await this.access.ensureBandAccess(user, lead.bandId);

    const event = await this.prisma.event.create({
      data: {
        organisationId: user.organisationId,
        bandId: lead.bandId,
        title: lead.name,
        type: 'GIG',
        status: 'PLANNED',
        startsAt: lead.expectedDate ?? new Date(),
        endsAt: new Date((lead.expectedDate ?? new Date()).getTime() + 3 * 60 * 60 * 1000),
        notes: `Converted from lead ${lead.id}`
      }
    });

    const updatedLead = await this.prisma.lead.update({
      where: { id },
      data: {
        convertedEventId: event.id,
        stage: LeadStage.CONFIRMED,
        version: { increment: 1 }
      }
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        message: 'Converted to event',
        meta: { eventId: event.id, by: user.id }
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: lead.bandId,
      entityType: 'EVENT',
      entityId: event.id,
      action: 'create',
      version: event.version,
      payload: { title: event.title }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: lead.bandId,
      entityType: 'LEAD',
      entityId: lead.id,
      action: 'update',
      version: updatedLead.version,
      payload: { stage: updatedLead.stage, convertedEventId: event.id }
    });

    return { lead: updatedLead, event };
  }

  async softDelete(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organisationId: user.organisationId, deletedAt: null }
    });
    if (!lead) throw new NotFoundException('Lead not found');

    await this.access.ensureBandAccess(user, lead.bandId);

    const deleted = await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: lead.bandId,
      entityType: 'LEAD',
      entityId: id,
      action: 'delete',
      version: deleted.version
    });

    return { ok: true };
  }
}
