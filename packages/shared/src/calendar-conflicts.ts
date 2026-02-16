export type MemberAvailabilityStatus = 'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE';

export interface CalendarEventWindow {
  id: string;
  title: string;
  type: string;
  startsAt: string | Date;
  endsAt: string | Date;
}

export interface MemberAvailabilityEntry {
  userId: string;
  status: MemberAvailabilityStatus;
  reason?: string | null;
}

export interface MemberCommitmentWindow {
  userId: string;
  eventId: string;
  startsAt: string | Date;
  endsAt: string | Date;
}

export interface ConflictDetectionInput {
  targetEventId?: string;
  startsAt: string | Date;
  endsAt: string | Date;
  lineupUserIds: string[];
  memberAvailability: MemberAvailabilityEntry[];
  committedEvents: MemberCommitmentWindow[];
  calendarEvents: CalendarEventWindow[];
}

export interface ConflictDetectionResult {
  unavailableMembers: MemberAvailabilityEntry[];
  doubleBookedMembers: Array<{
    userId: string;
    overlaps: MemberCommitmentWindow[];
  }>;
  travelOverlaps: CalendarEventWindow[];
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function overlapsWindow(
  leftStart: string | Date,
  leftEnd: string | Date,
  rightStart: string | Date,
  rightEnd: string | Date
): boolean {
  return asDate(leftStart).getTime() < asDate(rightEnd).getTime() &&
    asDate(leftEnd).getTime() > asDate(rightStart).getTime();
}

export function detectCalendarConflicts(input: ConflictDetectionInput): ConflictDetectionResult {
  const unavailableMembers = input.memberAvailability.filter(
    (entry) => input.lineupUserIds.includes(entry.userId) && entry.status === 'UNAVAILABLE'
  );

  const doubleBookedMembers = input.lineupUserIds
    .map((userId) => {
      const overlaps = input.committedEvents.filter(
        (commitment) =>
          commitment.userId === userId &&
          commitment.eventId !== input.targetEventId &&
          overlapsWindow(input.startsAt, input.endsAt, commitment.startsAt, commitment.endsAt)
      );

      return { userId, overlaps };
    })
    .filter((entry) => entry.overlaps.length > 0);

  const travelOverlaps = input.calendarEvents.filter(
    (event) =>
      event.id !== input.targetEventId &&
      event.type === 'TRAVEL' &&
      overlapsWindow(input.startsAt, input.endsAt, event.startsAt, event.endsAt)
  );

  return {
    unavailableMembers,
    doubleBookedMembers,
    travelOverlaps
  };
}
