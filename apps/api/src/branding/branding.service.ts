import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertBrandingDto } from './dto/upsert-branding.dto';

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthUser) {
    return this.prisma.brandingProfile.findMany({
      where: {
        organisationId: user.organisationId,
        deletedAt: null
      },
      orderBy: { host: 'asc' }
    });
  }

  async upsert(user: AuthUser, dto: UpsertBrandingDto) {
    const existing = await this.prisma.brandingProfile.findFirst({
      where: {
        organisationId: user.organisationId,
        host: dto.host,
        deletedAt: null
      }
    });

    const data = {
      organisationId: user.organisationId,
      host: dto.host,
      displayName: dto.displayName,
      logoUrl: dto.logoUrl,
      accentColor: dto.accentColor ?? '#38bdf8',
      emailTemplates: dto.emailTemplates
    };

    const saved = existing
      ? await this.prisma.brandingProfile.update({ where: { id: existing.id }, data })
      : await this.prisma.brandingProfile.create({ data });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'branding.upsert',
      entityType: 'BrandingProfile',
      entityId: saved.id,
      metadata: { host: saved.host }
    });

    return saved;
  }

  async resolve(host: string) {
    return this.prisma.brandingProfile.findFirst({
      where: {
        host,
        deletedAt: null
      },
      select: {
        displayName: true,
        logoUrl: true,
        accentColor: true,
        emailTemplates: true
      }
    });
  }
}
