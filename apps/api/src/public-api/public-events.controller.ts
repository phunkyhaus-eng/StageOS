import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyScopes } from './api-key-scopes.decorator';
import { ApiKeyGuard } from './api-key.guard';

interface ApiKeyRequest {
  apiKey: {
    id: string;
    organisationId: string;
    scopes: string[];
  };
}

@ApiTags('public')
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  @ApiKeyScopes('read:events')
  async listEvents(
    @Req() req: ApiKeyRequest,
    @Query('bandId') bandId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string
  ) {
    const limit = Math.min(Math.max(Number(limitRaw ?? 20), 1), 100);

    const events = await this.prisma.event.findMany({
      where: {
        organisationId: req.apiKey.organisationId,
        bandId,
        deletedAt: null,
        ...(cursor
          ? {
              id: {
                gt: cursor
              }
            }
          : {})
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: {
        id: true,
        bandId: true,
        title: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        venueName: true,
        address: true,
        mapUrl: true,
        updatedAt: true,
        version: true
      }
    });

    const items = events.slice(0, limit);
    const nextCursor = events.length > limit ? (events[limit]?.id ?? null) : null;

    return {
      items,
      nextCursor
    };
  }

  @Get('events/:id')
  @ApiKeyScopes('read:events')
  async getEvent(@Req() req: ApiKeyRequest, @Param('id') id: string) {
    return this.prisma.event.findFirstOrThrow({
      where: {
        id,
        organisationId: req.apiKey.organisationId,
        deletedAt: null
      },
      include: {
        schedules: { where: { deletedAt: null }, orderBy: { startsAt: 'asc' } },
        tasks: { where: { deletedAt: null } },
        contacts: {
          include: {
            contact: true
          }
        }
      }
    });
  }
}
