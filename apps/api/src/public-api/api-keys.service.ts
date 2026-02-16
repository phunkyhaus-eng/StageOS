import { Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async list(user: AuthUser) {
    return this.prisma.apiKey.findMany({
      where: {
        organisationId: user.organisationId,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        createdByUserId: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(user: AuthUser, dto: CreateApiKeyDto) {
    const raw = `sk_stageos_${uuidv4().replace(/-/g, '')}`;
    const keyHash = this.hash(raw);

    const created = await this.prisma.apiKey.create({
      data: {
        organisationId: user.organisationId,
        name: dto.name,
        keyHash,
        scopes: [...new Set(dto.scopes)].sort(),
        createdByUserId: user.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'api_key.create',
      entityType: 'ApiKey',
      entityId: created.id,
      metadata: { name: created.name, scopes: created.scopes }
    });

    return {
      id: created.id,
      name: created.name,
      scopes: created.scopes,
      key: raw,
      expiresAt: created.expiresAt
    };
  }

  async revoke(user: AuthUser, id: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!existing) throw new NotFoundException('API key not found');

    await this.prisma.apiKey.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'api_key.revoke',
      entityType: 'ApiKey',
      entityId: id
    });

    return { ok: true };
  }
}
