import { detectCalendarConflicts } from '@stageos/shared';

describe('detectCalendarConflicts', () => {
  it('flags unavailable members, double bookings, and travel overlaps', () => {
    const result = detectCalendarConflicts({
      targetEventId: 'evt-new',
      startsAt: '2026-03-10T18:00:00.000Z',
      endsAt: '2026-03-10T21:00:00.000Z',
      lineupUserIds: ['member-1', 'member-2'],
      memberAvailability: [
        { userId: 'member-1', status: 'AVAILABLE' },
        { userId: 'member-2', status: 'UNAVAILABLE', reason: 'Out of town' }
      ],
      committedEvents: [
        {
          userId: 'member-1',
          eventId: 'evt-overlap',
          startsAt: '2026-03-10T19:00:00.000Z',
          endsAt: '2026-03-10T22:00:00.000Z'
        },
        {
          userId: 'member-2',
          eventId: 'evt-later',
          startsAt: '2026-03-11T19:00:00.000Z',
          endsAt: '2026-03-11T22:00:00.000Z'
        }
      ],
      calendarEvents: [
        {
          id: 'travel-1',
          type: 'TRAVEL',
          title: 'Drive to venue',
          startsAt: '2026-03-10T16:00:00.000Z',
          endsAt: '2026-03-10T20:00:00.000Z'
        }
      ]
    });

    expect(result.unavailableMembers).toHaveLength(1);
    expect(result.unavailableMembers[0]?.userId).toBe('member-2');

    expect(result.doubleBookedMembers).toHaveLength(1);
    expect(result.doubleBookedMembers[0]?.userId).toBe('member-1');
    expect(result.doubleBookedMembers[0]?.overlaps[0]?.eventId).toBe('evt-overlap');

    expect(result.travelOverlaps).toHaveLength(1);
    expect(result.travelOverlaps[0]?.id).toBe('travel-1');
  });

  it('ignores commitments and travel from the same target event', () => {
    const result = detectCalendarConflicts({
      targetEventId: 'evt-1',
      startsAt: '2026-03-12T10:00:00.000Z',
      endsAt: '2026-03-12T12:00:00.000Z',
      lineupUserIds: ['member-1'],
      memberAvailability: [{ userId: 'member-1', status: 'AVAILABLE' }],
      committedEvents: [
        {
          userId: 'member-1',
          eventId: 'evt-1',
          startsAt: '2026-03-12T10:30:00.000Z',
          endsAt: '2026-03-12T11:00:00.000Z'
        }
      ],
      calendarEvents: [
        {
          id: 'evt-1',
          type: 'TRAVEL',
          title: 'Travel',
          startsAt: '2026-03-12T10:15:00.000Z',
          endsAt: '2026-03-12T11:15:00.000Z'
        }
      ]
    });

    expect(result.unavailableMembers).toEqual([]);
    expect(result.doubleBookedMembers).toEqual([]);
    expect(result.travelOverlaps).toEqual([]);
  });
});
