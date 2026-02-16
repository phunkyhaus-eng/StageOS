import { BadRequestException, Injectable } from '@nestjs/common';
import { FeatureFlagScope, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthUser, targetUserId?: string) {
    return this.prisma.featureFlag.findMany({
      where: {
        organisationId: user.organisationId,
        userId: targetUserId ?? null,
        deletedAt: null
      },
      orderBy: { key: 'asc' }
    });
  }

  async upsert(user: AuthUser, dto: UpsertFeatureFlagDto) {
    if (dto.scope === FeatureFlagScope.USER && !dto.userId) {
      throw new BadRequestException('userId is required for USER scoped feature flags');
    }

    const targetUserId = dto.scope === FeatureFlagScope.USER ? dto.userId ?? null : null;

    const existing = await this.prisma.featureFlag.findFirst({
      where: {
        organisationId: user.organisationId,
        userId: targetUserId,
        key: dto.key,
        deletedAt: null
      }
    });

    const configValue =
      dto.config === undefined
        ? undefined
        : (dto.config as unknown as Prisma.InputJsonValue);

    const payload = {
      organisationId: user.organisationId,
      userId: targetUserId,
      scope: dto.scope,
      key: dto.key,
      enabled: dto.enabled,
      config: configValue
    };

    const saved = existing
      ? await this.prisma.featureFlag.update({
          where: { id: existing.id },
          data: payload
        })
      : await this.prisma.featureFlag.create({ data: payload });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'feature_flag.upsert',
      entityType: 'FeatureFlag',
      entityId: saved.id,
      metadata: {
        key: saved.key,
        scope: saved.scope,
        enabled: saved.enabled,
        userId: saved.userId
      }
    });

    return saved;
  }

  async evaluateForUser(organisationId: string, userId: string, keys: string[]) {
    const [orgFlags, userFlags] = await this.prisma.$transaction([
      this.prisma.featureFlag.findMany({
        where: {
          organisationId,
          userId: null,
          key: { in: keys },
          deletedAt: null
        }
      }),
      this.prisma.featureFlag.findMany({
        where: {
          organisationId,
          userId,
          key: { in: keys },
          deletedAt: null
        }
      })
    ]);

    const orgMap = new Map<string, (typeof orgFlags)[number]>(
      orgFlags.map((flag) => [flag.key, flag])
    );
    const userMap = new Map<string, (typeof userFlags)[number]>(
      userFlags.map((flag) => [flag.key, flag])
    );

    return keys.map((key) => {
      const selected = userMap.get(key) ?? orgMap.get(key);
      return {
        key,
        enabled: selected?.enabled ?? false,
        config: selected?.config ?? null,
        source: selected?.userId ? 'USER' : selected ? 'ORG' : 'DEFAULT'
      };
    });
  }
}
