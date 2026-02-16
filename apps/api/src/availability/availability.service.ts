import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { ChangeLogService } from '../sync/change-log.service';
import { AvailabilityGridDto } from './dto/availability-grid.dto';
import { CreateAvailabilityRequestDto } from './dto/create-availability-request.dto';
import { RespondAvailabilityDto } from './dto/respond-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changeLog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  async createRequest(user: AuthUser, dto: CreateAvailabilityRequestDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const event = await this.prisma.event.findFirst({
      where: {
        id: dto.eventId,
        organisationId: user.organisationId,
        bandId: dto.bandId,
        deletedAt: null
      }
    });

    if (!event) throw new NotFoundException('Event not found');

    const members = await this.prisma.bandMembership.findMany({
      where: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        deletedAt: null
      },
      select: { userId: true }
    });

    const request = await this.prisma.availabilityRequest.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        eventId: dto.eventId,
        targetGroup: dto.targetGroup ?? 'band-members',
        notes: dto.notes,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        responses: {
          createMany: {
            data: members.map((m) => ({
              organisationId: user.organisationId,
              bandId: dto.bandId,
              userId: m.userId,
              response: AvailabilityStatus.PENDING
            }))
          }
        }
      },
      include: {
        responses: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'AVAILABILITY_REQUEST',
      entityId: request.id,
      action: 'create',
      version: request.version,
      payload: { eventId: request.eventId }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'availability.request.create',
      entityType: 'AvailabilityRequest',
      entityId: request.id,
      metadata: { eventId: request.eventId }
    });

    return request;
  }

  async listRequests(user: AuthUser, bandId: string, eventId?: string) {
    await this.access.ensureBandAccess(user, bandId);

    return this.prisma.availabilityRequest.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        eventId,
        deletedAt: null
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            venueName: true,
            rosterLocked: true
          }
        },
        responses: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async respond(user: AuthUser, requestId: string, dto: RespondAvailabilityDto) {
    const request = await this.prisma.availabilityRequest.findFirst({
      where: {
        id: requestId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        event: true,
        responses: { where: { userId: user.id, deletedAt: null } }
      }
    });

    if (!request) throw new NotFoundException('Availability request not found');
    if (request.lockedAt) throw new ConflictException('Availability has been locked');

    await this.access.ensureBandAccess(user, request.bandId);

    if (dto.response === AvailabilityStatus.YES) {
      const overlaps = await this.prisma.availabilityResponse.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: request.bandId,
          userId: user.id,
          response: AvailabilityStatus.YES,
          availabilityRequest: {
            event: {
              id: { not: request.eventId },
              startsAt: { lt: request.event.endsAt },
              endsAt: { gt: request.event.startsAt },
              deletedAt: null
            }
          },
          deletedAt: null
        },
        include: {
          availabilityRequest: {
            include: { event: { select: { id: true, title: true, startsAt: true, endsAt: true } } }
          }
        }
      });

      if (overlaps.length > 0) {
        throw new ConflictException({
          message: 'Double-booking detected',
          overlaps: overlaps.map((item) => item.availabilityRequest.event)
        });
      }
    }

    const existing = request.responses[0];
    const response = existing
      ? await this.prisma.availabilityResponse.update({
          where: { id: existing.id },
          data: {
            response: dto.response,
            notes: dto.notes,
            version: { increment: 1 }
          }
        })
      : await this.prisma.availabilityResponse.create({
          data: {
            organisationId: user.organisationId,
            bandId: request.bandId,
            availabilityRequestId: request.id,
            userId: user.id,
            response: dto.response,
            notes: dto.notes,
            version: 1
          }
        });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: request.bandId,
      entityType: 'AVAILABILITY_RESPONSE',
      entityId: response.id,
      action: existing ? 'update' : 'create',
      version: response.version,
      payload: { response: response.response }
    });

    return response;
  }

  async lockRoster(user: AuthUser, requestId: string) {
    const request = await this.prisma.availabilityRequest.findFirst({
      where: {
        id: requestId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        responses: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        event: true
      }
    });

    if (!request) throw new NotFoundException('Availability request not found');
    if (request.lockedAt) throw new ConflictException('Request already locked');

    await this.access.ensureBandAccess(user, request.bandId);

    const confirmed = request.responses.filter((resp) => resp.response === AvailabilityStatus.YES);

    const updatedRequest = await this.prisma.availabilityRequest.update({
      where: { id: request.id },
      data: {
        lockedAt: new Date(),
        version: { increment: 1 }
      }
    });

    await this.prisma.event.update({
      where: { id: request.eventId },
      data: {
        rosterLocked: true,
        version: { increment: 1 }
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: request.bandId,
      entityType: 'AVAILABILITY_REQUEST',
      entityId: request.id,
      action: 'lock',
      version: updatedRequest.version,
      payload: {
        eventId: request.eventId,
        confirmedUserIds: confirmed.map((r) => r.userId)
      }
    });

    return {
      requestId: request.id,
      eventId: request.eventId,
      confirmedRoster: confirmed.map((resp) => ({
        userId: resp.userId,
        name: resp.user.name,
        email: resp.user.email
      }))
    };
  }

  async grid(user: AuthUser, dto: AvailabilityGridDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const from = dto.from ? new Date(dto.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = dto.to ? new Date(dto.to) : new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

    const [memberships, requests, events] = await this.prisma.$transaction([
      this.prisma.bandMembership.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: dto.bandId,
          deletedAt: null
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }),
      this.prisma.availabilityRequest.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: dto.bandId,
          deletedAt: null,
          event: {
            startsAt: { lte: to },
            endsAt: { gte: from },
            deletedAt: null
          }
        },
        include: {
          event: true,
          responses: {
            where: { deletedAt: null },
            select: {
              userId: true,
              response: true,
              notes: true,
              updatedAt: true
            }
          }
        },
        orderBy: { event: { startsAt: 'asc' } }
      }),
      this.prisma.event.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: dto.bandId,
          startsAt: { lte: to },
          endsAt: { gte: from },
          deletedAt: null
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          venueName: true
        },
        orderBy: { startsAt: 'asc' }
      })
    ]);

    const responseByUserEvent = new Map<string, { response: AvailabilityStatus; notes: string | null }>();
    for (const request of requests) {
      for (const response of request.responses) {
        responseByUserEvent.set(`${response.userId}:${request.eventId}`, {
          response: response.response,
          notes: response.notes
        });
      }
    }

    const timelineByUser = new Map<string, Array<{ eventId: string; startsAt: Date; endsAt: Date; title: string }>>();
    for (const membership of memberships) {
      timelineByUser.set(membership.userId, []);
    }

    for (const request of requests) {
      for (const response of request.responses) {
        if (response.response === AvailabilityStatus.YES) {
          const list = timelineByUser.get(response.userId) ?? [];
          list.push({
            eventId: request.event.id,
            startsAt: request.event.startsAt,
            endsAt: request.event.endsAt,
            title: request.event.title
          });
          timelineByUser.set(response.userId, list);
        }
      }
    }

    const rows = memberships.map((membership) => {
      const userTimeline = (timelineByUser.get(membership.userId) ?? []).sort(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
      );

      const doubleBookings: Array<{ primaryEventId: string; conflictEventId: string }> = [];
      for (let i = 0; i < userTimeline.length; i += 1) {
        const current = userTimeline[i];
        if (!current) continue;
        for (let j = i + 1; j < userTimeline.length; j += 1) {
          const compare = userTimeline[j];
          if (!compare) continue;
          if (compare.startsAt >= current.endsAt) {
            break;
          }
          if (compare.startsAt < current.endsAt && compare.endsAt > current.startsAt) {
            doubleBookings.push({
              primaryEventId: current.eventId,
              conflictEventId: compare.eventId
            });
          }
        }
      }

      return {
        user: membership.user,
        role: membership.roleName,
        responses: requests.map((request) => ({
          requestId: request.id,
          eventId: request.eventId,
          eventTitle: request.event.title,
          startsAt: request.event.startsAt,
          endsAt: request.event.endsAt,
          value:
            responseByUserEvent.get(`${membership.userId}:${request.eventId}`)?.response ??
            AvailabilityStatus.PENDING,
          notes: responseByUserEvent.get(`${membership.userId}:${request.eventId}`)?.notes ?? null
        })),
        doubleBookings
      };
    });

    return {
      from,
      to,
      events,
      requests: requests.map((request) => ({
        id: request.id,
        eventId: request.eventId,
        eventTitle: request.event.title,
        startsAt: request.event.startsAt,
        endsAt: request.event.endsAt,
        closesAt: request.closesAt,
        lockedAt: request.lockedAt
      })),
      rows
    };
  }
}
