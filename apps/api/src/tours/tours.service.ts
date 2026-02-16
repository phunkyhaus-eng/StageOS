import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItineraryType } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { ChangeLogService } from '../sync/change-log.service';
import { AddTourEventDto } from './dto/add-tour-event.dto';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { CreateTourDto } from './dto/create-tour.dto';
import { TourSheetQueryDto } from './dto/tour-sheet-query.dto';

interface Coordinate {
  lat: number;
  lng: number;
}

@Injectable()
export class ToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changeLog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  private parseCoordinate(input?: string | null): Coordinate | null {
    if (!input) return null;

    const direct = input.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (direct) {
      const lat = Number(direct[1]);
      const lng = Number(direct[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }

    const mapQ = input.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (mapQ) {
      return { lat: Number(mapQ[1]), lng: Number(mapQ[2]) };
    }

    const mapAt = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (mapAt) {
      return { lat: Number(mapAt[1]), lng: Number(mapAt[2]) };
    }

    return null;
  }

  private haversineKm(a: Coordinate, b: Coordinate): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

    return R * c;
  }

  private parseCostFromNotes(notes?: string | null): number {
    if (!notes) return 0;
    const match = notes.match(/(?:cost|price)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    return match ? Number(match[1]) : 0;
  }

  async list(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    return this.prisma.tour.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      include: {
        events: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                startsAt: true,
                endsAt: true,
                venueName: true,
                address: true,
                mapUrl: true
              }
            }
          }
        },
        itineraryItems: {
          where: { deletedAt: null },
          orderBy: { startsAt: 'asc' }
        }
      },
      orderBy: { startsAt: 'asc' }
    });
  }

  async create(user: AuthUser, dto: CreateTourDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const created = await this.prisma.tour.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        name: dto.name,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        notes: dto.notes
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'TOUR',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: { name: created.name }
    });

    return created;
  }

  async addEvents(user: AuthUser, tourId: string, dto: AddTourEventDto) {
    const tour = await this.prisma.tour.findFirst({
      where: {
        id: tourId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!tour) throw new NotFoundException('Tour not found');
    await this.access.ensureBandAccess(user, tour.bandId);

    const events = await this.prisma.event.findMany({
      where: {
        id: { in: dto.eventIds },
        organisationId: user.organisationId,
        bandId: tour.bandId,
        deletedAt: null
      }
    });

    if (events.length !== dto.eventIds.length) {
      throw new BadRequestException('One or more events are invalid for this band');
    }

    for (const eventId of dto.eventIds) {
      await this.prisma.tourEvent.upsert({
        where: {
          tourId_eventId: {
            tourId,
            eventId
          }
        },
        update: {},
        create: {
          tourId,
          eventId
        }
      });
    }

    await this.prisma.tour.update({
      where: { id: tourId },
      data: { version: { increment: 1 } }
    });

    return this.getById(user, tourId);
  }

  async addItineraryItem(user: AuthUser, tourId: string, dto: CreateItineraryItemDto) {
    const tour = await this.prisma.tour.findFirst({
      where: {
        id: tourId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!tour) throw new NotFoundException('Tour not found');
    await this.access.ensureBandAccess(user, tour.bandId);

    const created = await this.prisma.itineraryItem.create({
      data: {
        organisationId: user.organisationId,
        bandId: tour.bandId,
        tourId,
        eventId: dto.eventId,
        type: dto.type,
        title: dto.title,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        location: dto.location,
        notes: dto.notes,
        version: 1
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: tour.bandId,
      entityType: 'ITINERARY_ITEM',
      entityId: created.id,
      action: 'create',
      version: created.version,
      payload: {
        type: created.type,
        title: created.title
      }
    });

    return created;
  }

  async getById(user: AuthUser, tourId: string) {
    const tour = await this.prisma.tour.findFirst({
      where: {
        id: tourId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        events: {
          include: {
            event: true
          }
        },
        itineraryItems: {
          where: { deletedAt: null },
          orderBy: { startsAt: 'asc' }
        }
      }
    });

    if (!tour) throw new NotFoundException('Tour not found');
    await this.access.ensureBandAccess(user, tour.bandId);

    return tour;
  }

  async dailySheet(user: AuthUser, tourId: string, query: TourSheetQueryDto) {
    const tour = await this.getById(user, tourId);

    const eventStops = tour.events.map((tourEvent) => ({
      id: tourEvent.event.id,
      type: 'EVENT' as const,
      title: tourEvent.event.title,
      startsAt: tourEvent.event.startsAt,
      endsAt: tourEvent.event.endsAt,
      location: tourEvent.event.mapUrl ?? tourEvent.event.address ?? null,
      venueName: tourEvent.event.venueName
    }));

    const itineraryStops = tour.itineraryItems.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      location: item.location,
      venueName: null as string | null,
      notes: item.notes
    }));

    const stops = [...eventStops, ...itineraryStops].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
    );

    let totalDistanceKm = 0;
    let travelMinutes = 0;

    const legs: Array<{
      fromId: string;
      toId: string;
      distanceKm: number;
      estimatedMinutes: number;
      hasCoordinates: boolean;
    }> = [];

    for (let i = 1; i < stops.length; i += 1) {
      const from = stops[i - 1];
      const to = stops[i];
      if (!from || !to) {
        continue;
      }
      const fromCoord = this.parseCoordinate(from.location ?? undefined);
      const toCoord = this.parseCoordinate(to.location ?? undefined);

      if (!fromCoord || !toCoord) {
        legs.push({
          fromId: from.id,
          toId: to.id,
          distanceKm: 0,
          estimatedMinutes: 0,
          hasCoordinates: false
        });
        continue;
      }

      const distanceKm = this.haversineKm(fromCoord, toCoord);
      const estimatedMinutes = Math.round((distanceKm / 80) * 60);
      totalDistanceKm += distanceKm;
      travelMinutes += estimatedMinutes;

      legs.push({
        fromId: from.id,
        toId: to.id,
        distanceKm: Number(distanceKm.toFixed(2)),
        estimatedMinutes,
        hasCoordinates: true
      });
    }

    const fuelPricePerLiter = query.fuelPricePerLiter ?? 1.9;
    const litersPer100Km = query.litersPer100Km ?? 9;
    const fuelCost = Number(((totalDistanceKm / 100) * litersPer100Km * fuelPricePerLiter).toFixed(2));

    const eventIds = tour.events.map((item) => item.eventId);
    const [invoices, expenses] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: {
          organisationId: user.organisationId,
          eventId: { in: eventIds },
          deletedAt: null
        },
        select: { total: true }
      }),
      this.prisma.expense.findMany({
        where: {
          organisationId: user.organisationId,
          eventId: { in: eventIds },
          deletedAt: null
        },
        select: { amount: true }
      })
    ]);

    const accommodationCost = itineraryStops
      .filter((item) => item.type === ItineraryType.HOTEL)
      .reduce((sum, item) => sum + this.parseCostFromNotes(item.notes), 0);

    const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const breakEven = revenue - expenseTotal - fuelCost - accommodationCost;

    const profitabilityScore = revenue <= 0
      ? 0
      : Math.max(0, Math.min(100, Math.round((breakEven / revenue) * 100)));

    const dayMap = new Map<string, typeof stops>();
    for (const stop of stops) {
      const day = stop.startsAt.toISOString().slice(0, 10);
      const entries = dayMap.get(day) ?? [];
      entries.push(stop);
      dayMap.set(day, entries);
    }

    return {
      tour: {
        id: tour.id,
        name: tour.name,
        startsAt: tour.startsAt,
        endsAt: tour.endsAt
      },
      routing: {
        totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
        travelMinutes,
        legs
      },
      finance: {
        revenue,
        expenseTotal,
        fuelCost,
        accommodationCost,
        breakEven,
        profitabilityScore
      },
      dailySheet: Array.from(dayMap.entries()).map(([day, entries]) => ({
        day,
        entries
      }))
    };
  }
}
