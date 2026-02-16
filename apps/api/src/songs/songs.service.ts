import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { CreateSongDto } from './dto/create-song.dto';
import { CreateSongVersionDto } from './dto/create-song-version.dto';

@Injectable()
export class SongsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changelog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);
    return this.prisma.song.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      include: {
        versions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { title: 'asc' }
    });
  }

  async create(user: AuthUser, dto: CreateSongDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const created = await this.prisma.song.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        title: dto.title,
        key: dto.key,
        bpm: dto.bpm,
        durationSec: dto.durationSec,
        tags: dto.tags ?? [],
        notes: dto.notes
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'SONG',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: { title: created.title }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'song.create',
      entityType: 'Song',
      entityId: created.id
    });

    return created;
  }

  async createVersion(user: AuthUser, dto: CreateSongVersionDto) {
    const song = await this.prisma.song.findFirst({
      where: {
        id: dto.songId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });
    if (!song) throw new NotFoundException('Song not found');

    await this.access.ensureBandAccess(user, song.bandId);

    const version = await this.prisma.songVersion.create({
      data: {
        organisationId: user.organisationId,
        bandId: song.bandId,
        songId: song.id,
        name: dto.name,
        arrangementKey: dto.arrangementKey,
        notes: dto.notes
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: song.bandId,
      entityType: 'SONG_VERSION',
      entityId: version.id,
      action: 'create',
      version: version.version,
      payload: { name: version.name }
    });

    return version;
  }
}
