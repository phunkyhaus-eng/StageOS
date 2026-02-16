import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureBandAccess(user: AuthUser, bandId: string): Promise<void> {
    const membership = await this.prisma.bandMembership.findFirst({
      where: {
        bandId,
        organisationId: user.organisationId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!membership) {
      throw new ForbiddenException('Band access denied for user');
    }
  }

  ensureOrgScope(user: AuthUser, organisationId: string): void {
    if (user.organisationId !== organisationId) {
      throw new ForbiddenException('Cross-organisation access denied');
    }
  }

  pagination(page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    return {
      skip: (safePage - 1) * safePageSize,
      take: safePageSize
    };
  }
}
