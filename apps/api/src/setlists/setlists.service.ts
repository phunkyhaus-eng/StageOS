import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../rbac/access.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import { mergeSetlistOps } from './merge';
import { CreateSetlistDto } from './dto/create-setlist.dto';
import { ApplySetlistOpsDto } from './dto/apply-ops.dto';

@Injectable()
export class SetlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changelog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);
    return this.prisma.setlist.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      include: {
        items: {
          where: { deletedAt: null },
          include: { songVersion: { include: { song: true } } },
          orderBy: { position: 'asc' }
        }
      }
    });
  }

  async create(user: AuthUser, dto: CreateSetlistDto) {
    await this.access.ensureBandAccess(user, dto.bandId);
    const created = await this.prisma.setlist.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        eventId: dto.eventId,
        name: dto.name,
        locked: dto.locked ?? false
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'SETLIST',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: { name: created.name }
    });

    return created;
  }

  async getOne(user: AuthUser, setlistId: string) {
    const setlist = await this.prisma.setlist.findFirst({
      where: {
        id: setlistId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        items: {
          where: { deletedAt: null },
          include: { songVersion: { include: { song: true } } },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!setlist) throw new NotFoundException('Setlist not found');
    await this.access.ensureBandAccess(user, setlist.bandId);

    return setlist;
  }

  async applyOperations(user: AuthUser, setlistId: string, dto: ApplySetlistOpsDto) {
    const setlist = await this.prisma.setlist.findFirst({
      where: {
        id: setlistId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });
    if (!setlist) throw new NotFoundException('Setlist not found');
    await this.access.ensureBandAccess(user, setlist.bandId);

    if (setlist.locked) {
      throw new ConflictException('Setlist is locked for this event');
    }

    const existingItems = await this.prisma.setlistItem.findMany({
      where: {
        setlistId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      orderBy: { position: 'asc' }
    });

    const hasOrderingConflict = dto.baseVersion !== setlist.version;
    const merge = mergeSetlistOps(
      existingItems.map((item) => ({
        id: item.id,
        songVersionId: item.songVersionId,
        notes: item.notes,
        durationSec: item.durationSec
      })),
      dto.operations,
      hasOrderingConflict
    );

    const upserted = await this.prisma.$transaction(async (tx) => {
      await tx.setlistItem.deleteMany({
        where: {
          setlistId,
          organisationId: user.organisationId
        }
      });

      for (let i = 0; i < merge.items.length; i += 1) {
        const item = merge.items[i];
        if (!item) continue;
        await tx.setlistItem.create({
          data: {
            id: item.id,
            organisationId: user.organisationId,
            bandId: setlist.bandId,
            setlistId,
            songVersionId: item.songVersionId,
            position: i + 1,
            notes: item.notes,
            durationSec: item.durationSec,
            version: 1
          }
        });
      }

      const totalDurationSec = merge.items.reduce((sum, item) => sum + (item.durationSec ?? 0), 0);

      return tx.setlist.update({
        where: { id: setlistId },
        data: {
          version: { increment: 1 },
          totalDurationSec
        }
      });
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: setlist.bandId,
      entityType: 'SETLIST',
      entityId: setlistId,
      action: 'setlistOps',
      version: upserted.version,
      payload: merge.mergePatch as unknown as Record<string, unknown>
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'setlist.ops',
      entityType: 'Setlist',
      entityId: setlistId,
      metadata: merge.mergePatch
    });

    return {
      setlistId,
      serverVersion: upserted.version,
      mergePatch: merge.mergePatch
    };
  }

  async lock(user: AuthUser, setlistId: string) {
    const setlist = await this.prisma.setlist.findFirst({
      where: {
        id: setlistId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!setlist) throw new NotFoundException('Setlist not found');
    await this.access.ensureBandAccess(user, setlist.bandId);

    const updated = await this.prisma.setlist.update({
      where: { id: setlistId },
      data: {
        locked: true,
        version: { increment: 1 }
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: setlist.bandId,
      entityType: 'SETLIST',
      entityId: setlistId,
      action: 'update',
      version: updated.version,
      payload: { locked: true }
    });

    return updated;
  }
}
