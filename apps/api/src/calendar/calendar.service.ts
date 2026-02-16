import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import type { AuthUser } from '../common/types/auth-user';
import { GoogleSyncDto } from './dto/google-sync.dto';

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  private buildIcs(events: Array<{ id: string; title: string; startsAt: Date; endsAt: Date; venueName: string | null; address: string | null; notes: string | null; updatedAt: Date }>, prodId: string): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `PRODID:${prodId}`
    ];

    for (const event of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.id}@stageos.local`);
      lines.push(`DTSTAMP:${formatIcsDate(event.updatedAt)}`);
      lines.push(`DTSTART:${formatIcsDate(event.startsAt)}`);
      lines.push(`DTEND:${formatIcsDate(event.endsAt)}`);
      lines.push(`SUMMARY:${escapeIcs(event.title)}`);
      if (event.venueName || event.address) {
        lines.push(`LOCATION:${escapeIcs([event.venueName, event.address].filter(Boolean).join(' - '))}`);
      }
      if (event.notes) {
        lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
      }
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  async bandIcs(calendarToken: string) {
    const band = await this.prisma.band.findFirst({
      where: {
        calendarToken,
        deletedAt: null
      }
    });

    if (!band) throw new NotFoundException('Band calendar not found');

    const events = await this.prisma.event.findMany({
      where: {
        bandId: band.id,
        deletedAt: null
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        venueName: true,
        address: true,
        notes: true,
        updatedAt: true
      },
      orderBy: { startsAt: 'asc' }
    });

    return this.buildIcs(events, '-//StageOS//Band Calendar//EN');
  }

  async userIcs(calendarToken: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        calendarToken,
        deletedAt: null
      }
    });

    if (!user) throw new NotFoundException('User calendar not found');

    const bandIds = (
      await this.prisma.bandMembership.findMany({
        where: {
          userId: user.id,
          deletedAt: null
        },
        select: { bandId: true }
      })
    ).map((item) => item.bandId);

    const events = await this.prisma.event.findMany({
      where: {
        bandId: { in: bandIds },
        deletedAt: null
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        venueName: true,
        address: true,
        notes: true,
        updatedAt: true
      },
      orderBy: { startsAt: 'asc' }
    });

    return this.buildIcs(events, '-//StageOS//User Calendar//EN');
  }

  async exportCsv(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const events = await this.prisma.event.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      orderBy: { startsAt: 'asc' }
    });

    const headers = ['id', 'title', 'type', 'status', 'startsAt', 'endsAt', 'venueName', 'address'];
    const rows = events.map((event) => [
      event.id,
      event.title,
      event.type,
      event.status,
      event.startsAt.toISOString(),
      event.endsAt.toISOString(),
      event.venueName ?? '',
      event.address ?? ''
    ]);

    return [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  async syncGoogleCalendar(user: AuthUser, dto: GoogleSyncDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const events = await this.prisma.event.findMany({
      where: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        deletedAt: null,
        startsAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { startsAt: 'asc' },
      take: 250
    });

    const results: Array<{ eventId: string; status: number; ok: boolean }> = [];

    for (const event of events) {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(dto.calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${dto.accessToken}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            summary: event.title,
            description: event.notes,
            location: [event.venueName, event.address].filter(Boolean).join(' - '),
            start: { dateTime: event.startsAt.toISOString() },
            end: { dateTime: event.endsAt.toISOString() },
            source: {
              title: 'StageOS',
              url: `https://stageos.app/events/${event.id}`
            },
            extendedProperties: {
              private: {
                stageosEventId: event.id
              }
            }
          })
        }
      );

      results.push({ eventId: event.id, status: response.status, ok: response.ok });
    }

    return {
      attempted: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }
}
