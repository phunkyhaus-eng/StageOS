import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMe(@CurrentUser() user: AuthUser) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        organisationId: true,
        calendarToken: true,
        memberships: {
          where: { deletedAt: null },
          select: { bandId: true, roleName: true, band: { select: { name: true, calendarToken: true } } }
        }
      }
    });

    return {
      ...dbUser,
      roles: user.roles,
      permissions: user.permissions
    };
  }
}
