'use client';

import { detectCalendarConflicts, type MemberAvailabilityEntry, type MemberAvailabilityStatus } from '@stageos/shared';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAssignStaffingManual,
  useAvailabilityGrid,
  useAvailabilityRequests,
  useCreateStaffingPerson,
  useCreateAvailabilityRequest,
  useCreateEvent,
  useEventDetail,
  useEvents,
  usePauseStaffingOffers,
  useResendStaffingOffer,
  useStaffingGig,
  useStaffingPersons,
  useStartStaffingOffers,
  useSetMemberAvailabilityResponse,
  useSkipStaffingCandidate,
  useUpsertGigStaffingRequirements,
  useUpdateEvent
} from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';
import { Panel } from '@/components/ui/panel';

type CalendarView = 'day' | 'week' | 'month' | 'agenda';
type EventType = 'GIG' | 'REHEARSAL' | 'TRAVEL' | 'HOLD' | 'PROMO' | 'RECORDING' | 'DEADLINE' | 'OTHER';
type BookingStatus = 'HOLD' | 'TENTATIVE' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
type AvailabilityValue = 'PENDING' | 'YES' | 'NO' | 'MAYBE';

type MetadataContact = { name: string; phone?: string; email?: string; role?: string };
type MetadataDep = { name: string; role?: string; contact?: string };
type MetadataAttachment = { label: string; kind?: string; url?: string };

type EventMetadata = {
  gig?: {
    clientBooker?: string;
    contacts?: MetadataContact[];
    times?: {
      loadIn?: string;
      soundcheck?: string;
      doors?: string;
      set1?: string;
      set2?: string;
      curfew?: string;
      loadOut?: string;
    };
    notes?: {
      parking?: string;
      hospitality?: string;
      specialInstructions?: string;
    };
    lineupMemberIds?: string[];
    deps?: MetadataDep[];
    attachments?: MetadataAttachment[];
  };
  rehearsal?: {
    objective?: string;
    requiredLineupMemberIds?: string[];
    location?: string;
    durationMinutes?: number;
  };
  travel?: {
    origin?: string;
    destination?: string;
    departAt?: string;
    arriveAt?: string;
    notes?: string;
  };
};

type CalendarMember = {
  id: string;
  name: string;
  email: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  type: EventType;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  venueName?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  notes?: string | null;
  metadata: EventMetadata;
  tours: Array<{ id: string; name: string }>;
};

type AvailabilityGridRow = {
  user: CalendarMember;
  responses: Array<{
    requestId: string;
    eventId: string;
    startsAt: string;
    endsAt: string;
    value: AvailabilityValue;
    notes?: string | null;
  }>;
  doubleBookings: Array<{
    primaryEventId: string;
    conflictEventId: string;
  }>;
};

type AvailabilityRequest = {
  id: string;
  eventId: string;
  responses: Array<{
    userId: string;
    response: AvailabilityValue;
    notes?: string | null;
    user: CalendarMember;
  }>;
};

type StaffRole = 'DRUMS' | 'BASS' | 'GUITAR' | 'VOCALS' | 'SOUND' | 'KEYS' | 'PERCUSSION' | 'OTHER';
type RequirementStatus = 'UNFILLED' | 'OFFERING' | 'FILLED';
type AssignmentStatus = 'OFFERED' | 'CONFIRMED' | 'DECLINED' | 'EXPIRED';

type StaffingPerson = {
  id: string;
  name: string;
  email: string;
  roles: StaffRole[];
  status: 'ACTIVE' | 'INACTIVE';
};

type StaffingAttempt = {
  id: string;
  personId: string;
  personName: string;
  response?: 'YES' | 'NO';
  sentAt: string;
  expiresAt: string;
  respondedAt?: string;
};

type StaffingAssignment = {
  id: string;
  personId: string;
  personName: string;
  status: AssignmentStatus;
  conflictWarning?: string;
};

type StaffingRequirement = {
  id: string;
  role: StaffRole;
  quantity: number;
  status: RequirementStatus;
  offersPaused: boolean;
  rankedPersonIds: string[];
  assignments: StaffingAssignment[];
  attempts: StaffingAttempt[];
};

type EventEditorState = {
  mode: 'create' | 'edit';
  eventId?: string;
  title: string;
  type: EventType;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  venueName: string;
  address: string;
  mapUrl: string;
  notes: string;
  metadata: EventMetadata;
};

type DragState = {
  mode: 'move' | 'resize';
  eventId: string;
  startX: number;
  startY: number;
  startDayIndex: number;
  originalStart: Date;
  originalEnd: Date;
};

const VIEW_STORAGE_KEY = 'stageos-calendar-view';
const FILTER_STORAGE_KEY = 'stageos-calendar-filters';
const EVENT_TYPES: EventType[] = ['GIG', 'REHEARSAL', 'TRAVEL', 'HOLD', 'PROMO', 'RECORDING', 'DEADLINE', 'OTHER'];
const STATUS_OPTIONS: BookingStatus[] = ['HOLD', 'TENTATIVE', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
const STAFF_ROLES: StaffRole[] = ['DRUMS', 'BASS', 'GUITAR', 'VOCALS', 'SOUND', 'KEYS', 'PERCUSSION', 'OTHER'];
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 58;
const SNAP_MINUTES = 15;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function isAllDayEvent(event: CalendarEvent): boolean {
  if (event.allDay) return true;
  const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
  return durationMs >= 24 * 60 * 60 * 1000;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

function startOfWeek(date: Date): Date {
  const normalized = startOfDay(date);
  return addDays(normalized, -normalized.getDay());
}

function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function toDateKey(date: Date | string): string {
  const parsed = date instanceof Date ? date : new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateTimeLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeLocalInput(value: string): Date {
  return new Date(value);
}

function parseMetadata(raw: unknown): EventMetadata {
  const root = asRecord(raw);
  const gig = asRecord(root.gig);
  const rehearsal = asRecord(root.rehearsal);
  const travel = asRecord(root.travel);

  const contacts = Array.isArray(gig.contacts)
    ? gig.contacts.map((item) => {
        const row = asRecord(item);
        return {
          name: asString(row.name),
          phone: asOptionalString(row.phone),
          email: asOptionalString(row.email),
          role: asOptionalString(row.role)
        };
      })
    : [];

  const deps = Array.isArray(gig.deps)
    ? gig.deps.map((item) => {
        const row = asRecord(item);
        return {
          name: asString(row.name),
          role: asOptionalString(row.role),
          contact: asOptionalString(row.contact)
        };
      })
    : [];

  const attachments = Array.isArray(gig.attachments)
    ? gig.attachments.map((item) => {
        const row = asRecord(item);
        return {
          label: asString(row.label),
          kind: asOptionalString(row.kind),
          url: asOptionalString(row.url)
        };
      })
    : [];

  const gigLineup = Array.isArray(gig.lineupMemberIds)
    ? gig.lineupMemberIds.filter((value): value is string => typeof value === 'string')
    : [];

  const rehearsalLineup = Array.isArray(rehearsal.requiredLineupMemberIds)
    ? rehearsal.requiredLineupMemberIds.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    gig: {
      clientBooker: asOptionalString(gig.clientBooker),
      contacts,
      times: {
        loadIn: asOptionalString(asRecord(gig.times).loadIn),
        soundcheck: asOptionalString(asRecord(gig.times).soundcheck),
        doors: asOptionalString(asRecord(gig.times).doors),
        set1: asOptionalString(asRecord(gig.times).set1),
        set2: asOptionalString(asRecord(gig.times).set2),
        curfew: asOptionalString(asRecord(gig.times).curfew),
        loadOut: asOptionalString(asRecord(gig.times).loadOut)
      },
      notes: {
        parking: asOptionalString(asRecord(gig.notes).parking),
        hospitality: asOptionalString(asRecord(gig.notes).hospitality),
        specialInstructions: asOptionalString(asRecord(gig.notes).specialInstructions)
      },
      lineupMemberIds: gigLineup,
      deps,
      attachments
    },
    rehearsal: {
      objective: asOptionalString(rehearsal.objective),
      requiredLineupMemberIds: rehearsalLineup,
      location: asOptionalString(rehearsal.location),
      durationMinutes:
        typeof rehearsal.durationMinutes === 'number' && Number.isFinite(rehearsal.durationMinutes)
          ? rehearsal.durationMinutes
          : undefined
    },
    travel: {
      origin: asOptionalString(travel.origin),
      destination: asOptionalString(travel.destination),
      departAt: asOptionalString(travel.departAt),
      arriveAt: asOptionalString(travel.arriveAt),
      notes: asOptionalString(travel.notes)
    }
  };
}

function serializeMetadata(metadata: EventMetadata): Record<string, unknown> {
  return {
    gig: {
      clientBooker: metadata.gig?.clientBooker ?? null,
      contacts: (metadata.gig?.contacts ?? []).filter((entry) => entry.name.trim().length > 0),
      times: metadata.gig?.times ?? {},
      notes: metadata.gig?.notes ?? {},
      lineupMemberIds: metadata.gig?.lineupMemberIds ?? [],
      deps: (metadata.gig?.deps ?? []).filter((entry) => entry.name.trim().length > 0),
      attachments: (metadata.gig?.attachments ?? []).filter((entry) => entry.label.trim().length > 0)
    },
    rehearsal: {
      objective: metadata.rehearsal?.objective ?? null,
      requiredLineupMemberIds: metadata.rehearsal?.requiredLineupMemberIds ?? [],
      location: metadata.rehearsal?.location ?? null,
      durationMinutes: metadata.rehearsal?.durationMinutes ?? null
    },
    travel: {
      origin: metadata.travel?.origin ?? null,
      destination: metadata.travel?.destination ?? null,
      departAt: metadata.travel?.departAt ?? null,
      arriveAt: metadata.travel?.arriveAt ?? null,
      notes: metadata.travel?.notes ?? null
    }
  };
}

function eventBadgeClasses(type: EventType, status: BookingStatus): string {
  const typeTone: Record<EventType, string> = {
    GIG: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
    REHEARSAL: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100',
    TRAVEL: 'border-amber-400/50 bg-amber-500/15 text-amber-100',
    HOLD: 'border-violet-400/50 bg-violet-500/15 text-violet-100',
    PROMO: 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100',
    RECORDING: 'border-indigo-400/50 bg-indigo-500/15 text-indigo-100',
    DEADLINE: 'border-rose-400/50 bg-rose-500/15 text-rose-100',
    OTHER: 'border-slate-500/50 bg-slate-500/15 text-slate-100'
  };

  const holdStyle = status === 'HOLD' || status === 'TENTATIVE' || type === 'HOLD'
    ? ' border-dashed opacity-85'
    : '';

  return `border ${typeTone[type]}${holdStyle}`;
}

function statusPillClasses(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    HOLD: 'bg-violet-500/25 text-violet-100 border-violet-400/40',
    TENTATIVE: 'bg-violet-500/15 text-violet-100 border-violet-400/30',
    PLANNED: 'bg-slate-600/30 text-slate-100 border-slate-500/30',
    CONFIRMED: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40',
    COMPLETED: 'bg-cyan-500/20 text-cyan-100 border-cyan-400/40',
    CANCELLED: 'bg-rose-500/20 text-rose-100 border-rose-400/40'
  };

  return `border ${map[status]}`;
}

function getDefaultStatus(type: EventType): BookingStatus {
  if (type === 'HOLD') return 'HOLD';
  if (type === 'GIG') return 'TENTATIVE';
  return 'PLANNED';
}

function getLineupMemberIds(eventType: EventType, metadata: EventMetadata): string[] {
  if (eventType === 'GIG') return metadata.gig?.lineupMemberIds ?? [];
  if (eventType === 'REHEARSAL') return metadata.rehearsal?.requiredLineupMemberIds ?? [];
  return [];
}

function parseCalendarEvent(raw: Record<string, unknown>): CalendarEvent {
  const toursRaw = Array.isArray(raw.tours) ? raw.tours : [];
  const tours = toursRaw
    .map((item) => asRecord(item).tour)
    .map((item) => asRecord(item))
    .filter((tour) => typeof tour.id === 'string')
    .map((tour) => ({ id: String(tour.id), name: asString(tour.name) || 'Tour' }));

  return {
    id: String(raw.id),
    title: asString(raw.title) || 'Untitled Event',
    type: (asString(raw.type) as EventType) || 'OTHER',
    status: (asString(raw.status) as BookingStatus) || 'PLANNED',
    startsAt: asDate(raw.startsAt),
    endsAt: asDate(raw.endsAt),
    allDay: asBoolean(raw.allDay),
    venueName: asOptionalString(raw.venueName) ?? null,
    address: asOptionalString(raw.address) ?? null,
    mapUrl: asOptionalString(raw.mapUrl) ?? null,
    notes: asOptionalString(raw.notes) ?? null,
    metadata: parseMetadata(raw.metadataJson),
    tours
  };
}

function buildEditorState(input: {
  mode: 'create' | 'edit';
  event?: CalendarEvent;
  presetStart?: Date;
  presetEnd?: Date;
  presetAllDay?: boolean;
}): EventEditorState {
  const event = input.event;
  const now = new Date();
  const defaultStart = input.presetStart ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0, 0);
  const defaultEnd =
    input.presetEnd ??
    new Date(
      defaultStart.getTime() + ((input.presetAllDay ?? false) ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000)
    );

  const type = event?.type ?? 'GIG';

  return {
    mode: input.mode,
    eventId: event?.id,
    title: event?.title ?? '',
    type,
    status: event?.status ?? getDefaultStatus(type),
    startsAt: toDateTimeLocalInput(event?.startsAt ?? defaultStart),
    endsAt: toDateTimeLocalInput(event?.endsAt ?? defaultEnd),
    allDay: event?.allDay ?? Boolean(input.presetAllDay),
    venueName: event?.venueName ?? '',
    address: event?.address ?? '',
    mapUrl: event?.mapUrl ?? '',
    notes: event?.notes ?? '',
    metadata: event?.metadata ?? parseMetadata({})
  };
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function roundToSnap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTimeRange(event: CalendarEvent): string {
  if (isAllDayEvent(event)) {
    return 'All day';
  }

  return `${event.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${event.endsAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function monthGridStart(date: Date): Date {
  return startOfWeek(startOfMonth(date));
}

function monthGridDays(date: Date): Date[] {
  const start = monthGridStart(date);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function safeStringArray(value: string[] | undefined): string[] {
  return value ? [...new Set(value.filter((item) => item.trim().length > 0))] : [];
}

function asStaffRole(value: unknown): StaffRole {
  return STAFF_ROLES.includes(value as StaffRole) ? (value as StaffRole) : 'OTHER';
}

function asRequirementStatus(value: unknown): RequirementStatus {
  if (value === 'FILLED') return 'FILLED';
  if (value === 'OFFERING') return 'OFFERING';
  return 'UNFILLED';
}

function asAssignmentStatus(value: unknown): AssignmentStatus {
  if (value === 'CONFIRMED') return 'CONFIRMED';
  if (value === 'DECLINED') return 'DECLINED';
  if (value === 'EXPIRED') return 'EXPIRED';
  return 'OFFERED';
}

function parseStaffingPeople(raw: unknown): StaffingPerson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      id: String(row.id),
      name: asString(row.name) || 'Candidate',
      email: asString(row.email),
      roles: Array.isArray(row.roles)
        ? row.roles.filter((role): role is StaffRole => STAFF_ROLES.includes(role as StaffRole))
        : [],
      status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
    }));
}

function parseStaffingRequirements(raw: unknown): StaffingRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter((row) => typeof row.id === 'string')
    .map((row) => {
      const rankList = Array.isArray(row.rankList) ? row.rankList.map((entry) => asRecord(entry)) : [];
      const assignmentsRaw = Array.isArray(row.assignments) ? row.assignments.map((entry) => asRecord(entry)) : [];
      const attemptsRaw = Array.isArray(row.attempts) ? row.attempts.map((entry) => asRecord(entry)) : [];

      return {
        id: String(row.id),
        role: asStaffRole(row.role),
        quantity: typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 1,
        status: asRequirementStatus(row.status),
        offersPaused: Boolean(row.offersPaused),
        rankedPersonIds: rankList
          .sort((left, right) => Number(left.rank ?? 0) - Number(right.rank ?? 0))
          .map((entry) => asString(entry.personId))
          .filter((personId) => personId.length > 0),
        assignments: assignmentsRaw.map((entry) => ({
          id: asString(entry.id),
          personId: asString(entry.personId),
          personName: asString(asRecord(entry.person).name) || 'Candidate',
          status: asAssignmentStatus(entry.assignmentStatus),
          conflictWarning: asOptionalString(entry.conflictWarning)
        })),
        attempts: attemptsRaw.map((entry) => ({
          id: asString(entry.id),
          personId: asString(entry.personId),
          personName: asString(asRecord(entry.person).name) || 'Candidate',
          response:
            entry.response === 'YES' || entry.response === 'NO'
              ? (entry.response as 'YES' | 'NO')
              : undefined,
          sentAt: asString(entry.sentAt),
          expiresAt: asString(entry.expiresAt),
          respondedAt: asOptionalString(entry.respondedAt)
        }))
      } satisfies StaffingRequirement;
    });
}

export default function EventsPage() {
  const user = useAppStore((s) => s.user);
  const eventsQuery = useEvents({ page: 1, pageSize: 400 });
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const [view, setView] = useState<CalendarView>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [pickerMonth, setPickerMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<Set<EventType>>(() => new Set(EVENT_TYPES));
  const [enabledStatuses, setEnabledStatuses] = useState<Set<BookingStatus>>(() => new Set(STATUS_OPTIONS));
  const [showBandCalendar, setShowBandCalendar] = useState(true);
  const [showHoldsCalendar, setShowHoldsCalendar] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EventEditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [availabilityNotesDraft, setAvailabilityNotesDraft] = useState<Record<string, string>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ eventId: string; startsAt: Date; endsAt: Date } | null>(null);
  const [staffingDraft, setStaffingDraft] = useState<Array<{
    id?: string;
    role: StaffRole;
    quantity: number;
    rankedPersonIds: string[];
  }>>([]);
  const [newRole, setNewRole] = useState<StaffRole>('DRUMS');
  const [manualAssignPersonByRequirement, setManualAssignPersonByRequirement] = useState<Record<string, string>>({});
  const [newCandidateName, setNewCandidateName] = useState('');
  const [newCandidateEmail, setNewCandidateEmail] = useState('');
  const [newCandidateRoles, setNewCandidateRoles] = useState<Set<StaffRole>>(new Set());

  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY) as CalendarView | null;
    if (savedView && ['day', 'week', 'month', 'agenda'].includes(savedView)) {
      setView(savedView);
    }

    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        typeFilter?: EventType[];
        statusFilter?: BookingStatus[];
        showBandCalendar?: boolean;
        showHoldsCalendar?: boolean;
      };

      if (parsed.typeFilter) setEnabledTypes(new Set(parsed.typeFilter));
      if (parsed.statusFilter) setEnabledStatuses(new Set(parsed.statusFilter));
      if (typeof parsed.showBandCalendar === 'boolean') setShowBandCalendar(parsed.showBandCalendar);
      if (typeof parsed.showHoldsCalendar === 'boolean') setShowHoldsCalendar(parsed.showHoldsCalendar);
    } catch {
      // Ignore malformed local state.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        typeFilter: Array.from(enabledTypes),
        statusFilter: Array.from(enabledStatuses),
        showBandCalendar,
        showHoldsCalendar
      })
    );
  }, [enabledTypes, enabledStatuses, showBandCalendar, showHoldsCalendar]);

  useEffect(() => {
    if (!editor) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditor(null);
        setEditorError(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const visibleRange = useMemo(() => {
    if (view === 'day') {
      return { from: startOfDay(anchorDate), to: endOfDay(anchorDate) };
    }

    if (view === 'week') {
      return { from: startOfWeek(anchorDate), to: endOfWeek(anchorDate) };
    }

    if (view === 'month') {
      const monthStart = monthGridStart(anchorDate);
      return { from: startOfDay(monthStart), to: endOfDay(addDays(monthStart, 41)) };
    }

    return {
      from: startOfDay(addDays(anchorDate, -7)),
      to: endOfDay(addDays(anchorDate, 90))
    };
  }, [view, anchorDate]);

  const availabilityGrid = useAvailabilityGrid({
    from: visibleRange.from.toISOString(),
    to: visibleRange.to.toISOString()
  });

  const eventDetail = useEventDetail(selectedEventId);
  const availabilityRequests = useAvailabilityRequests(selectedEventId);
  const createAvailabilityRequest = useCreateAvailabilityRequest();
  const setMemberResponse = useSetMemberAvailabilityResponse();
  const staffingGigQuery = useStaffingGig(selectedEventId);
  const staffingPeopleQuery = useStaffingPersons();
  const upsertStaffingRequirements = useUpsertGigStaffingRequirements();
  const startStaffingOffers = useStartStaffingOffers();
  const pauseStaffingOffers = usePauseStaffingOffers();
  const skipStaffingCandidate = useSkipStaffingCandidate();
  const resendStaffingOffer = useResendStaffingOffer();
  const assignStaffingManual = useAssignStaffingManual();
  const createStaffingPerson = useCreateStaffingPerson();

  const events = useMemo(() => {
    const items = (eventsQuery.data?.items ?? []) as Array<Record<string, unknown>>;
    return items.map(parseCalendarEvent);
  }, [eventsQuery.data?.items]);

  const eventsById = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    for (const event of events) map.set(event.id, event);
    return map;
  }, [events]);

  const selectedEventFromList = selectedEventId ? eventsById.get(selectedEventId) ?? null : null;
  const selectedEventFromDetail = useMemo(() => {
    if (!eventDetail.data) return null;
    return parseCalendarEvent(eventDetail.data as Record<string, unknown>);
  }, [eventDetail.data]);

  const selectedEvent = selectedEventFromDetail ?? selectedEventFromList;
  const staffingPeople = useMemo(
    () => parseStaffingPeople(staffingPeopleQuery.data),
    [staffingPeopleQuery.data]
  );
  const staffingRequirements = useMemo(
    () => parseStaffingRequirements(asRecord(staffingGigQuery.data).requirements),
    [staffingGigQuery.data]
  );

  const availabilityRows = useMemo(() => {
    const rows = (availabilityGrid.data as { rows?: AvailabilityGridRow[] } | undefined)?.rows ?? [];
    return rows;
  }, [availabilityGrid.data]);

  const members = useMemo(() => availabilityRows.map((row) => row.user), [availabilityRows]);

  const responseByEventUser = useMemo(() => {
    const map = new Map<string, { value: AvailabilityValue; notes?: string | null; requestId: string }>();
    for (const row of availabilityRows) {
      for (const response of row.responses) {
        map.set(`${response.eventId}:${row.user.id}`, {
          value: response.value,
          notes: response.notes,
          requestId: response.requestId
        });
      }
    }
    return map;
  }, [availabilityRows]);

  const committedByUser = useMemo(() => {
    const map = new Map<string, Array<{ eventId: string; startsAt: Date; endsAt: Date }>>();

    for (const row of availabilityRows) {
      const commitments = row.responses
        .filter((response) => response.value === 'YES')
        .map((response) => ({
          eventId: response.eventId,
          startsAt: asDate(response.startsAt),
          endsAt: asDate(response.endsAt)
        }));

      map.set(row.user.id, commitments);
    }

    return map;
  }, [availabilityRows]);

  const doubleBookingPairsByUser = useMemo(() => {
    const map = new Map<string, Array<{ primaryEventId: string; conflictEventId: string }>>();
    for (const row of availabilityRows) {
      map.set(row.user.id, row.doubleBookings ?? []);
    }
    return map;
  }, [availabilityRows]);

  const eventsFiltered = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      if (!enabledTypes.has(event.type)) return false;
      if (!enabledStatuses.has(event.status)) return false;

      const isHoldLike = event.status === 'HOLD' || event.status === 'TENTATIVE' || event.type === 'HOLD';
      if (!showBandCalendar && !isHoldLike) return false;
      if (!showHoldsCalendar && isHoldLike) return false;

      if (selectedMemberIds.size > 0) {
        const lineupIds = getLineupMemberIds(event.type, event.metadata);
        const hasMemberMatch = Array.from(selectedMemberIds).some((memberId) => {
          if (lineupIds.includes(memberId)) return true;
          const response = responseByEventUser.get(`${event.id}:${memberId}`);
          return response !== undefined && response.value !== 'PENDING';
        });

        if (!hasMemberMatch) return false;
      }

      if (!search) return true;

      const searchHaystack = [
        event.title,
        event.venueName ?? '',
        event.address ?? '',
        event.notes ?? '',
        event.metadata.gig?.clientBooker ?? '',
        event.metadata.rehearsal?.objective ?? '',
        event.metadata.travel?.origin ?? '',
        event.metadata.travel?.destination ?? ''
      ]
        .join(' ')
        .toLowerCase();

      return searchHaystack.includes(search);
    });
  }, [
    events,
    enabledTypes,
    enabledStatuses,
    showBandCalendar,
    showHoldsCalendar,
    selectedMemberIds,
    responseByEventUser,
    searchQuery
  ]);

  const conflictSummaryByEventId = useMemo(() => {
    const map = new Map<string, { unavailable: number; doubleBooked: number; travelOverlaps: number }>();

    for (const event of eventsFiltered) {
      const lineupIds = getLineupMemberIds(event.type, event.metadata);
      const memberAvailability: MemberAvailabilityEntry[] = lineupIds
        .map((userId) => {
          const response = responseByEventUser.get(`${event.id}:${userId}`)?.value;
          if (response === 'NO') {
            return { userId, status: 'UNAVAILABLE' as MemberAvailabilityStatus };
          }
          if (response === 'MAYBE') {
            return { userId, status: 'MAYBE' as MemberAvailabilityStatus };
          }
          if (response === 'YES') {
            return { userId, status: 'AVAILABLE' as MemberAvailabilityStatus };
          }
          return null;
        })
        .filter((entry): entry is MemberAvailabilityEntry => entry !== null);

      const committed = lineupIds.flatMap((userId) =>
        (committedByUser.get(userId) ?? []).map((item) => ({
          userId,
          eventId: item.eventId,
          startsAt: item.startsAt,
          endsAt: item.endsAt
        }))
      );

      const conflicts = detectCalendarConflicts({
        targetEventId: event.id,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        lineupUserIds: lineupIds,
        memberAvailability,
        committedEvents: committed,
        calendarEvents: eventsFiltered.map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          type: candidate.type,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt
        }))
      });

      const doubleBookedCount = conflicts.doubleBookedMembers.length;
      const unavailableCount = conflicts.unavailableMembers.length;
      const travelCount = conflicts.travelOverlaps.length;

      map.set(event.id, {
        unavailable: unavailableCount,
        doubleBooked: doubleBookedCount,
        travelOverlaps: travelCount
      });
    }

    return map;
  }, [eventsFiltered, responseByEventUser, committedByUser]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [anchorDate]);

  const dayStartMinutes = DAY_START_HOUR * 60;
  const dayEndMinutes = DAY_END_HOUR * 60;
  const totalDayMinutes = dayEndMinutes - dayStartMinutes;
  const timelineHeight = ((DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT);

  const timelineDays = useMemo(() => {
    if (view === 'day') return [startOfDay(anchorDate)];
    if (view === 'week') return weekDays;
    return [] as Date[];
  }, [view, anchorDate, weekDays]);

  const monthDays = useMemo(() => monthGridDays(anchorDate), [anchorDate]);

  const eventsByDateKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of eventsFiltered) {
      const start = startOfDay(event.startsAt);
      const end = startOfDay(event.endsAt);
      const spanDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

      for (let offset = 0; offset < spanDays; offset += 1) {
        const day = addDays(start, offset);
        const key = toDateKey(day);
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
      }
    }

    return map;
  }, [eventsFiltered]);

  const agendaDays = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();

    for (const event of eventsFiltered.slice().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
      const key = toDateKey(event.startsAt);
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => ({ key, date: asDate(key), events: values }));
  }, [eventsFiltered]);

  const selectedRequest = useMemo(() => {
    const list = (availabilityRequests.data ?? []) as Array<Record<string, unknown>>;
    if (list.length === 0) return null;

    const request = list[0];
    const responses = Array.isArray(request.responses)
      ? request.responses.map((responseRaw) => {
          const response = asRecord(responseRaw);
          const userRaw = asRecord(response.user);
          return {
            userId: asString(response.userId),
            response: (asString(response.response) as AvailabilityValue) || 'PENDING',
            notes: asOptionalString(response.notes) ?? null,
            user: {
              id: asString(userRaw.id),
              name: asString(userRaw.name) || 'Member',
              email: asString(userRaw.email)
            }
          };
        })
      : [];

    return {
      id: asString(request.id),
      eventId: asString(request.eventId),
      responses
    } as AvailabilityRequest;
  }, [availabilityRequests.data]);

  const editorLineupUserIds = useMemo(() => {
    if (!editor) return [];
    return safeStringArray(getLineupMemberIds(editor.type, editor.metadata));
  }, [editor]);

  const editorConflicts = useMemo(() => {
    if (!editor) return null;

    const start = fromDateTimeLocalInput(editor.startsAt);
    const end = editor.endsAt ? fromDateTimeLocalInput(editor.endsAt) : addMinutes(start, editor.allDay ? 1440 : 120);
    const lineupIds = editorLineupUserIds;

    const memberAvailability: MemberAvailabilityEntry[] = [];
    for (const userId of lineupIds) {
      const responseEntry = selectedRequest?.responses.find((item) => item.userId === userId);
      const response = responseEntry?.response;

      if (response === 'NO') {
        memberAvailability.push({
          userId,
          status: 'UNAVAILABLE' as MemberAvailabilityStatus,
          reason: responseEntry?.notes ?? undefined
        });
        continue;
      }

      if (response === 'MAYBE') {
        memberAvailability.push({ userId, status: 'MAYBE' as MemberAvailabilityStatus });
        continue;
      }

      if (response === 'YES') {
        memberAvailability.push({ userId, status: 'AVAILABLE' as MemberAvailabilityStatus });
      }
    }

    const commitments = lineupIds.flatMap((userId) =>
      (committedByUser.get(userId) ?? []).map((item) => ({
        userId,
        eventId: item.eventId,
        startsAt: item.startsAt,
        endsAt: item.endsAt
      }))
    );

    return detectCalendarConflicts({
      targetEventId: editor.eventId,
      startsAt: start,
      endsAt: end,
      lineupUserIds: lineupIds,
      memberAvailability,
      committedEvents: commitments,
      calendarEvents: events.map((event) => ({
        id: event.id,
        title: event.title,
        type: event.type,
        startsAt: event.startsAt,
        endsAt: event.endsAt
      }))
    });
  }, [editor, editorLineupUserIds, selectedRequest, committedByUser, events]);

  useEffect(() => {
    if (!editor || editor.mode !== 'edit' || !selectedEvent) return;
    setEditor(buildEditorState({ mode: 'edit', event: selectedEvent }));
  }, [selectedEventId, selectedEvent]);

  useEffect(() => {
    if (!editor || editor.mode !== 'edit' || editor.type !== 'GIG' || !selectedEventId) {
      setStaffingDraft([]);
      setManualAssignPersonByRequirement({});
      return;
    }

    const nextDraft = staffingRequirements.map((requirement) => ({
      id: requirement.id,
      role: requirement.role,
      quantity: requirement.quantity,
      rankedPersonIds: requirement.rankedPersonIds.slice(0, 6)
    }));

    setStaffingDraft(nextDraft);
    setManualAssignPersonByRequirement((current) => {
      const next: Record<string, string> = {};
      for (const requirement of staffingRequirements) {
        const currentValue = current[requirement.id];
        if (currentValue && requirement.rankedPersonIds.includes(currentValue)) {
          next[requirement.id] = currentValue;
          continue;
        }
        next[requirement.id] = requirement.rankedPersonIds[0] ?? '';
      }
      return next;
    });
  }, [editor, selectedEventId, staffingRequirements]);

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const dayCount = timelineDays.length;
      if (dayCount === 0) return;

      const columnWidth = rect.width / dayCount;
      const currentDayIndex = clamp(Math.floor((event.clientX - rect.left) / columnWidth), 0, dayCount - 1);
      const dayDelta = currentDayIndex - dragState.startDayIndex;

      const minuteHeight = HOUR_HEIGHT / 60;
      const minuteDelta = roundToSnap((event.clientY - dragState.startY) / minuteHeight);

      if (dragState.mode === 'move') {
        const duration = dragState.originalEnd.getTime() - dragState.originalStart.getTime();
        const startsAt = addMinutes(addDays(dragState.originalStart, dayDelta), minuteDelta);
        const endsAt = new Date(startsAt.getTime() + duration);
        setDragPreview({ eventId: dragState.eventId, startsAt, endsAt });
      } else {
        const endsAt = addMinutes(addDays(dragState.originalEnd, dayDelta), minuteDelta);
        const minEnd = addMinutes(dragState.originalStart, 15);
        setDragPreview({
          eventId: dragState.eventId,
          startsAt: dragState.originalStart,
          endsAt: endsAt.getTime() > minEnd.getTime() ? endsAt : minEnd
        });
      }
    };

    const onPointerUp = async () => {
      if (dragPreview && dragPreview.eventId === dragState.eventId) {
        await updateEvent.mutateAsync({
          eventId: dragState.eventId,
          patch: {
            startsAt: dragPreview.startsAt.toISOString(),
            endsAt: dragPreview.endsAt.toISOString()
          }
        });
      }

      setDragState(null);
      setDragPreview(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragState, dragPreview, timelineDays.length, updateEvent]);

  const changeAnchorByView = (direction: -1 | 1) => {
    if (view === 'day') {
      setAnchorDate((current) => addDays(current, direction));
      return;
    }

    if (view === 'week') {
      setAnchorDate((current) => addDays(current, direction * 7));
      return;
    }

    if (view === 'month') {
      setAnchorDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
      setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
      return;
    }

    setAnchorDate((current) => addDays(current, direction * 14));
  };

  const openCreateFromDate = (date: Date, allDay = false) => {
    const startsAt = allDay
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 19, 0, 0, 0);
    const endsAt = allDay ? addDays(startsAt, 1) : addMinutes(startsAt, 120);

    setEditor(buildEditorState({ mode: 'create', presetStart: startsAt, presetEnd: endsAt, presetAllDay: allDay }));
    setEditorError(null);
    setSelectedEventId(null);
  };

  const openCreateFromTimeline = (day: Date, clientY: number) => {
    if (!timelineRef.current) {
      openCreateFromDate(day, false);
      return;
    }

    const rect = timelineRef.current.getBoundingClientRect();
    const y = clamp(clientY - rect.top, 0, rect.height);
    const minuteFromTop = y / (HOUR_HEIGHT / 60);
    const snappedMinutes = roundToSnap(dayStartMinutes + minuteFromTop);
    const hour = Math.floor(snappedMinutes / 60);
    const minute = snappedMinutes % 60;

    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
    const endsAt = addMinutes(startsAt, 120);

    setEditor(buildEditorState({ mode: 'create', presetStart: startsAt, presetEnd: endsAt }));
    setEditorError(null);
    setSelectedEventId(null);
  };

  const openEdit = (event: CalendarEvent) => {
    setSelectedEventId(event.id);
    setEditor(buildEditorState({ mode: 'edit', event }));
    setEditorError(null);
  };

  const onSaveEvent = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!editor) return;

    setEditorError(null);

    try {
      const startsAt = fromDateTimeLocalInput(editor.startsAt);
      const endsAt = editor.endsAt ? fromDateTimeLocalInput(editor.endsAt) : undefined;
      const payload = {
        title: editor.title,
        type: editor.type,
        status: editor.status,
        startsAt: startsAt.toISOString(),
        ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
        allDay: editor.allDay,
        venueName: editor.venueName || undefined,
        address: editor.address || undefined,
        mapUrl: editor.mapUrl || undefined,
        notes: editor.notes || undefined,
        metadataJson: serializeMetadata(editor.metadata)
      };

      if (editor.mode === 'create') {
        const created = await createEvent.mutateAsync(payload);
        if (created.id) {
          setSelectedEventId(String(created.id));
        }
      } else if (editor.eventId) {
        await updateEvent.mutateAsync({
          eventId: editor.eventId,
          patch: payload
        });
      }

      setEditor(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to save event');
    }
  };

  const toggleTypeFilter = (type: EventType) => {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleStatusFilter = (status: BookingStatus) => {
    setEnabledStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleMemberFilter = (memberId: string) => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const updateEditor = <K extends keyof EventEditorState>(key: K, value: EventEditorState[K]) => {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateMetadata = (mutator: (draft: EventMetadata) => EventMetadata) => {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        metadata: mutator(current.metadata)
      };
    });
  };

  const ensureAvailabilityRequest = async () => {
    if (!selectedEventId) return;
    if (selectedRequest) return;

    await createAvailabilityRequest.mutateAsync({ eventId: selectedEventId });
  };

  const getMemberResponse = (memberId: string): AvailabilityValue => {
    return selectedRequest?.responses.find((item) => item.userId === memberId)?.response ?? 'PENDING';
  };

  const onMemberResponseChange = async (memberId: string, response: AvailabilityValue) => {
    if (!selectedRequest) return;

    await setMemberResponse.mutateAsync({
      requestId: selectedRequest.id,
      userId: memberId,
      response,
      notes: availabilityNotesDraft[memberId]
    });
  };

  const onAvailabilityNoteBlur = async (memberId: string) => {
    if (!selectedRequest) return;

    await setMemberResponse.mutateAsync({
      requestId: selectedRequest.id,
      userId: memberId,
      response: getMemberResponse(memberId),
      notes: availabilityNotesDraft[memberId]
    });
  };

  const updateStaffingDraft = (
    role: StaffRole,
    mutator: (current: { id?: string; role: StaffRole; quantity: number; rankedPersonIds: string[] }) => {
      id?: string;
      role: StaffRole;
      quantity: number;
      rankedPersonIds: string[];
    }
  ) => {
    setStaffingDraft((current) =>
      current.map((entry) => (entry.role === role ? mutator(entry) : entry))
    );
  };

  const addStaffingRole = () => {
    setStaffingDraft((current) => {
      if (current.some((entry) => entry.role === newRole)) return current;
      return [...current, { role: newRole, quantity: 1, rankedPersonIds: [] }];
    });
  };

  const removeStaffingRole = (role: StaffRole) => {
    setStaffingDraft((current) => current.filter((entry) => entry.role !== role));
  };

  const onCreateCandidate = async () => {
    if (!newCandidateName.trim() || !newCandidateEmail.trim()) return;

    await createStaffingPerson.mutateAsync({
      name: newCandidateName.trim(),
      email: newCandidateEmail.trim(),
      roles: Array.from(newCandidateRoles)
    });

    setNewCandidateName('');
    setNewCandidateEmail('');
    setNewCandidateRoles(new Set());
  };

  const saveStaffingPlan = async () => {
    if (!selectedEventId) return;

    await upsertStaffingRequirements.mutateAsync({
      gigId: selectedEventId,
      requirements: staffingDraft.map((entry) => ({
        role: entry.role,
        quantity: Math.max(1, Math.trunc(entry.quantity || 1)),
        offerPolicy: 'CASCADE',
        rankedPersonIds: entry.rankedPersonIds.filter((personId) => personId.length > 0)
      }))
    });
  };

  const runStaffingAction = async (
    action:
      | 'start'
      | 'pause'
      | 'skip'
      | 'resend'
      | 'assign-manual',
    requirementId: string
  ) => {
    if (!selectedEventId) return;

    if (action === 'start') {
      await startStaffingOffers.mutateAsync({ requirementId, gigId: selectedEventId });
      return;
    }

    if (action === 'pause') {
      await pauseStaffingOffers.mutateAsync({ requirementId, gigId: selectedEventId });
      return;
    }

    if (action === 'skip') {
      await skipStaffingCandidate.mutateAsync({ requirementId, gigId: selectedEventId });
      return;
    }

    if (action === 'resend') {
      await resendStaffingOffer.mutateAsync({ requirementId, gigId: selectedEventId });
      return;
    }

    const personId = manualAssignPersonByRequirement[requirementId];
    if (!personId) return;

    await assignStaffingManual.mutateAsync({ requirementId, gigId: selectedEventId, personId });
  };

  const timelineEventsByDay = useMemo(() => {
    if (timelineDays.length === 0) return [] as Array<{ day: Date; events: CalendarEvent[] }>;

    return timelineDays.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      return {
        day,
        events: eventsFiltered.filter((event) => overlaps(event.startsAt, event.endsAt, dayStart, dayEnd))
      };
    });
  }, [timelineDays, eventsFiltered]);

  const monthLabel = anchorDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Panel title="Calendar Scope" subtitle="Band, hold queue, and member overlays">
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showBandCalendar} onChange={(event) => setShowBandCalendar(event.target.checked)} />
              <span>Band Calendar</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showHoldsCalendar} onChange={(event) => setShowHoldsCalendar(event.target.checked)} />
              <span>Holds</span>
            </label>

            <div className="pt-2">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">Member Calendars</p>
              <div className="max-h-44 space-y-1 overflow-auto pr-1">
                {members.length === 0 ? <p className="text-xs text-slate-500">No member data yet.</p> : null}
                {members.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(member.id)}
                      onChange={() => toggleMemberFilter(member.id)}
                    />
                    <span>{member.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Mini Month" subtitle="Jump quickly">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="h-9 rounded-md border border-slate-700 px-2 text-xs"
              onClick={() => setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            >
              Prev
            </button>
            <p className="text-xs font-semibold text-slate-200">
              {pickerMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              className="h-9 rounded-md border border-slate-700 px-2 text-xs"
              onClick={() => setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <p key={day} className="text-center">
                {day}
              </p>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthGridDays(pickerMonth).map((day) => {
              const active = toDateKey(day) === toDateKey(anchorDate);
              const inMonth = day.getMonth() === pickerMonth.getMonth();

              return (
                <button
                  key={toDateKey(day)}
                  type="button"
                  className={`h-8 rounded-md text-xs ${
                    active
                      ? 'bg-cyan-500 text-slate-950'
                      : inMonth
                        ? 'border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700'
                        : 'border border-slate-900 bg-slate-950/40 text-slate-500'
                  }`}
                  onClick={() => {
                    setAnchorDate(day);
                    if (view === 'month') {
                      setPickerMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                    }
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Filters" subtitle="Type, status, and search">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="mb-3 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
            placeholder="Search title, venue, client, notes..."
          />

          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">Event Types</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleTypeFilter(type)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  enabledTypes.has(type) ? eventBadgeClasses(type, 'CONFIRMED') : 'border-slate-700 text-slate-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">Booking Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatusFilter(status)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  enabledStatuses.has(status) ? statusPillClasses(status) : 'border-slate-700 text-slate-500'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </Panel>
      </aside>

      <div className="space-y-4">
        <Panel title="Band Calendar" subtitle="Day / Week / Month / Agenda with hold/availability awareness">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" className="min-h-11 rounded-md border border-slate-700 px-3 text-sm" onClick={() => changeAnchorByView(-1)}>
              Prev
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-slate-700 px-3 text-sm"
              onClick={() => {
                const now = new Date();
                setAnchorDate(now);
                setPickerMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              Today
            </button>
            <button type="button" className="min-h-11 rounded-md border border-slate-700 px-3 text-sm" onClick={() => changeAnchorByView(1)}>
              Next
            </button>

            <div className="ml-1 min-w-[180px] text-sm font-semibold text-slate-200">{monthLabel}</div>

            <div className="ml-auto flex flex-wrap gap-2">
              {(['day', 'week', 'month', 'agenda'] as CalendarView[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`min-h-11 rounded-md border px-3 text-sm ${
                    view === option ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-slate-700 text-slate-300'
                  }`}
                >
                  {option[0]?.toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {eventsQuery.isLoading ? <p className="text-sm text-slate-500">Loading calendar…</p> : null}

          {view === 'month' ? (
            <div>
              <div className="grid grid-cols-7 gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <p key={day} className="px-1 py-1">
                    {day}
                  </p>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-2">
                {monthDays.map((day) => {
                  const key = toDateKey(day);
                  const dayEvents = (eventsByDateKey.get(key) ?? [])
                    .slice()
                    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
                  const inMonth = day.getMonth() === anchorDate.getMonth();
                  const selected = toDateKey(anchorDate) === key;

                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setAnchorDate(day)}
                      onDoubleClick={() => openCreateFromDate(day, true)}
                      className={`min-h-[142px] rounded-lg border p-2 text-left transition ${
                        selected
                          ? 'border-cyan-400 bg-cyan-500/10'
                          : inMonth
                            ? 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                            : 'border-slate-900 bg-slate-950/30 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">{day.getDate()}</p>
                        <button
                          type="button"
                          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCreateFromDate(day);
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 4).map((event) => {
                          const conflict = conflictSummaryByEventId.get(event.id);
                          const warningCount = (conflict?.unavailable ?? 0) + (conflict?.doubleBooked ?? 0) + (conflict?.travelOverlaps ?? 0);

                          return (
                            <button
                              key={`${event.id}-${key}`}
                              type="button"
                              onClick={(itemEvent) => {
                                itemEvent.stopPropagation();
                                openEdit(event);
                              }}
                              className={`w-full truncate rounded border px-2 py-1 text-[11px] ${eventBadgeClasses(event.type, event.status)}`}
                              title={`${event.title} · ${formatTimeRange(event)}`}
                            >
                              <span>{event.title}</span>
                              {warningCount > 0 ? <span className="ml-1 text-amber-200">⚠{warningCount}</span> : null}
                            </button>
                          );
                        })}
                        {dayEvents.length > 4 ? <p className="text-[11px] text-slate-400">+{dayEvents.length - 4} more</p> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {view === 'week' || view === 'day' ? (
            <div className="space-y-2">
              <div className={`grid gap-2 ${view === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
                {timelineEventsByDay.map(({ day, events: dayEvents }, dayIndex) => {
                  const dayStart = startOfDay(day);
                  const dayEnd = endOfDay(day);
                  const allDayEvents = dayEvents.filter((event) => isAllDayEvent(event));

                  return (
                    <div key={toDateKey(day)} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{formatDateHeading(day)}</p>
                        <button
                          type="button"
                          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300"
                          onClick={() => openCreateFromDate(day)}
                        >
                          +
                        </button>
                      </div>

                      <div className="mb-2 min-h-[34px] space-y-1 rounded-md border border-slate-800 bg-slate-900/70 p-1">
                        {allDayEvents.length === 0 ? <p className="text-[11px] text-slate-500">All-day row</p> : null}
                        {allDayEvents.map((event) => (
                          <button
                            key={`allday-${event.id}-${toDateKey(day)}`}
                            type="button"
                            onClick={() => openEdit(event)}
                            className={`w-full truncate rounded border px-2 py-1 text-[11px] ${eventBadgeClasses(event.type, event.status)}`}
                          >
                            {event.title}
                          </button>
                        ))}
                      </div>

                      <div
                        ref={dayIndex === 0 ? timelineRef : undefined}
                        className="relative rounded-md border border-slate-800 bg-slate-950"
                        style={{ height: `${timelineHeight}px` }}
                        onClick={(event) => {
                          if (event.target !== event.currentTarget) return;
                          openCreateFromTimeline(day, event.clientY);
                        }}
                      >
                        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, idx) => {
                          const hour = DAY_START_HOUR + idx;
                          const top = (idx * HOUR_HEIGHT);

                          return (
                            <div key={hour} className="absolute inset-x-0 border-t border-slate-900" style={{ top: `${top}px` }}>
                              <span className="absolute -translate-y-1/2 bg-slate-950 px-1 text-[10px] text-slate-500">{String(hour).padStart(2, '0')}:00</span>
                            </div>
                          );
                        })}

                        {dayEvents
                          .filter((event) => !isAllDayEvent(event) && overlaps(event.startsAt, event.endsAt, dayStart, dayEnd))
                          .map((event) => {
                            const segmentStart = event.startsAt > dayStart ? event.startsAt : dayStart;
                            const segmentEnd = event.endsAt < dayEnd ? event.endsAt : dayEnd;
                            const topMinutes = clamp(minuteOfDay(segmentStart), dayStartMinutes, dayEndMinutes) - dayStartMinutes;
                            const bottomMinutes = clamp(minuteOfDay(segmentEnd), dayStartMinutes, dayEndMinutes) - dayStartMinutes;
                            const top = (topMinutes / totalDayMinutes) * timelineHeight;
                            const height = Math.max(24, ((bottomMinutes - topMinutes) / totalDayMinutes) * timelineHeight);
                            const preview = dragPreview && dragPreview.eventId === event.id
                              ? {
                                  startsAt: dragPreview.startsAt,
                                  endsAt: dragPreview.endsAt
                                }
                              : null;

                            const displayStart = preview ? preview.startsAt : event.startsAt;
                            const displayEnd = preview ? preview.endsAt : event.endsAt;
                            const conflict = conflictSummaryByEventId.get(event.id);
                            const warningCount = (conflict?.unavailable ?? 0) + (conflict?.doubleBooked ?? 0) + (conflict?.travelOverlaps ?? 0);

                            return (
                              <article
                                key={`timed-${event.id}-${toDateKey(day)}`}
                                className={`absolute left-1 right-1 rounded-md border px-2 py-1 text-[11px] ${eventBadgeClasses(event.type, event.status)}`}
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                <div
                                  className="cursor-grab text-[11px] font-semibold"
                                  onPointerDown={(pointerEvent) => {
                                    pointerEvent.stopPropagation();
                                    setDragState({
                                      mode: 'move',
                                      eventId: event.id,
                                      startX: pointerEvent.clientX,
                                      startY: pointerEvent.clientY,
                                      startDayIndex: dayIndex,
                                      originalStart: event.startsAt,
                                      originalEnd: event.endsAt
                                    });
                                  }}
                                  onDoubleClick={(pointerEvent) => {
                                    pointerEvent.stopPropagation();
                                    openEdit(event);
                                  }}
                                >
                                  <span>{event.title}</span>
                                  {warningCount > 0 ? <span className="ml-1 text-amber-200">⚠{warningCount}</span> : null}
                                </div>
                                <p className="truncate text-[10px] opacity-90">
                                  {displayStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {displayEnd.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                                <button
                                  type="button"
                                  aria-label="Resize duration"
                                  className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize rounded-b-md bg-black/15"
                                  onPointerDown={(pointerEvent) => {
                                    pointerEvent.stopPropagation();
                                    setDragState({
                                      mode: 'resize',
                                      eventId: event.id,
                                      startX: pointerEvent.clientX,
                                      startY: pointerEvent.clientY,
                                      startDayIndex: dayIndex,
                                      originalStart: event.startsAt,
                                      originalEnd: event.endsAt
                                    });
                                  }}
                                />
                              </article>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-500">
                Tip: click empty timeline to quick-create, drag event title to move, drag bottom handle to resize.
              </p>
            </div>
          ) : null}

          {view === 'agenda' ? (
            <div className="space-y-4">
              {agendaDays.length === 0 ? <p className="text-sm text-slate-500">No events in this range.</p> : null}
              {agendaDays.map((group) => {
                const eventsByTour = group.events.reduce<Map<string, CalendarEvent[]>>((acc, event) => {
                  const key = event.tours[0]?.name ?? 'General';
                  const list = acc.get(key) ?? [];
                  list.push(event);
                  acc.set(key, list);
                  return acc;
                }, new Map());

                return (
                  <section key={group.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <h3 className="text-sm font-semibold text-slate-200">{group.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                    <div className="mt-2 space-y-3">
                      {Array.from(eventsByTour.entries()).map(([tourName, items]) => (
                        <div key={`${group.key}-${tourName}`}>
                          <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-400">{tourName}</p>
                          <div className="space-y-2">
                            {items.map((event) => {
                              const conflict = conflictSummaryByEventId.get(event.id);
                              const warningCount = (conflict?.unavailable ?? 0) + (conflict?.doubleBooked ?? 0) + (conflict?.travelOverlaps ?? 0);
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${eventBadgeClasses(event.type, event.status)}`}
                                  onClick={() => openEdit(event)}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold">{event.title}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPillClasses(event.status)}`}>{event.status}</span>
                                  </div>
                                  <p className="mt-1 text-xs opacity-90">{formatTimeRange(event)}</p>
                                  <p className="mt-1 text-xs opacity-80">{event.venueName ?? 'Venue TBD'} · {event.address ?? 'Address TBD'}</p>
                                  {warningCount > 0 ? <p className="mt-1 text-xs text-amber-200">⚠ {warningCount} conflict warning(s)</p> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </Panel>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{editor.mode === 'create' ? 'Create Calendar Entry' : 'Edit Calendar Entry'}</h2>
                <p className="text-xs text-slate-400">Band-native call sheet, availability, and conflict checks</p>
              </div>
              <button type="button" className="rounded-md border border-slate-700 px-3 py-1.5 text-sm" onClick={() => setEditor(null)}>
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={onSaveEvent}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Title
                  <input
                    value={editor.title}
                    onChange={(event) => updateEditor('title', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                    required
                  />
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Type
                  <select
                    value={editor.type}
                    onChange={(event) => {
                      const nextType = event.target.value as EventType;
                      updateEditor('type', nextType);
                      if (editor.status === 'HOLD' && nextType !== 'HOLD') {
                        updateEditor('status', getDefaultStatus(nextType));
                      }
                    }}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                  >
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Status
                  <select
                    value={editor.status}
                    onChange={(event) => updateEditor('status', event.target.value as BookingStatus)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 md:mt-6">
                  <input
                    type="checkbox"
                    checked={editor.allDay}
                    onChange={(event) => updateEditor('allDay', event.target.checked)}
                  />
                  All-day
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Start
                  <input
                    type="datetime-local"
                    value={editor.startsAt}
                    onChange={(event) => updateEditor('startsAt', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                    required
                  />
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  End (Optional)
                  <input
                    type="datetime-local"
                    value={editor.endsAt}
                    onChange={(event) => updateEditor('endsAt', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                  />
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Venue
                  <input
                    value={editor.venueName}
                    onChange={(event) => updateEditor('venueName', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                  />
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Address
                  <input
                    value={editor.address}
                    onChange={(event) => updateEditor('address', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                  />
                </label>

                <label className="text-xs uppercase tracking-[0.14em] text-slate-400 xl:col-span-2">
                  Map Link
                  <input
                    value={editor.mapUrl}
                    onChange={(event) => updateEditor('mapUrl', event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                    placeholder="https://maps..."
                  />
                </label>
              </div>

              <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
                General Notes
                <textarea
                  value={editor.notes}
                  onChange={(event) => updateEditor('notes', event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </label>

              {editor.type === 'GIG' ? (
                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <h3 className="text-sm font-semibold text-slate-100">Gig Call Sheet</h3>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400 xl:col-span-2">
                      Client / Booker
                      <input
                        value={editor.metadata.gig?.clientBooker ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              clientBooker: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Contacts</h4>
                      <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 text-xs"
                        onClick={() =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              contacts: [...(draft.gig?.contacts ?? []), { name: '', phone: '', email: '', role: '' }]
                            }
                          }))
                        }
                      >
                        Add contact
                      </button>
                    </div>
                    {(editor.metadata.gig?.contacts ?? []).map((contact, index) => (
                      <div key={`contact-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-950/80 p-2 md:grid-cols-5">
                        <input
                          value={contact.name}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const contacts = [...(draft.gig?.contacts ?? [])];
                              contacts[index] = { ...contacts[index], name: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), contacts } };
                            })
                          }
                          placeholder="Name"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={contact.role ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const contacts = [...(draft.gig?.contacts ?? [])];
                              contacts[index] = { ...contacts[index], role: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), contacts } };
                            })
                          }
                          placeholder="Role"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={contact.phone ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const contacts = [...(draft.gig?.contacts ?? [])];
                              contacts[index] = { ...contacts[index], phone: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), contacts } };
                            })
                          }
                          placeholder="Phone"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={contact.email ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const contacts = [...(draft.gig?.contacts ?? [])];
                              contacts[index] = { ...contacts[index], email: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), contacts } };
                            })
                          }
                          placeholder="Email"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <button
                          type="button"
                          className="h-10 rounded-md border border-rose-700/60 text-sm text-rose-200"
                          onClick={() =>
                            updateMetadata((draft) => {
                              const contacts = [...(draft.gig?.contacts ?? [])];
                              contacts.splice(index, 1);
                              return { ...draft, gig: { ...(draft.gig ?? {}), contacts } };
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">

                    {([
                      ['loadIn', 'Load-in'],
                      ['soundcheck', 'Soundcheck'],
                      ['doors', 'Doors'],
                      ['set1', 'Set 1'],
                      ['set2', 'Set 2'],
                      ['curfew', 'Curfew'],
                      ['loadOut', 'Load-out']
                    ] as Array<[keyof NonNullable<EventMetadata['gig']>['times'], string]>).map(([key, label]) => (
                      <label key={key} className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        {label}
                        <input
                          type="time"
                          value={editor.metadata.gig?.times?.[key] ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => ({
                              ...draft,
                              gig: {
                                ...(draft.gig ?? {}),
                                times: {
                                  ...(draft.gig?.times ?? {}),
                                  [key]: event.target.value
                                }
                              }
                            }))
                          }
                          className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Parking
                      <textarea
                        value={editor.metadata.gig?.notes?.parking ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              notes: {
                                ...(draft.gig?.notes ?? {}),
                                parking: event.target.value
                              }
                            }
                          }))
                        }
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Hospitality
                      <textarea
                        value={editor.metadata.gig?.notes?.hospitality ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              notes: {
                                ...(draft.gig?.notes ?? {}),
                                hospitality: event.target.value
                              }
                            }
                          }))
                        }
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Special Instructions
                      <textarea
                        value={editor.metadata.gig?.notes?.specialInstructions ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              notes: {
                                ...(draft.gig?.notes ?? {}),
                                specialInstructions: event.target.value
                              }
                            }
                          }))
                        }
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Lineup</h4>
                      <p className="text-xs text-slate-500">Members on this gig</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {members.map((member) => {
                        const selected = (editor.metadata.gig?.lineupMemberIds ?? []).includes(member.id);
                        return (
                          <label key={member.id} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                updateMetadata((draft) => {
                                  const current = new Set(draft.gig?.lineupMemberIds ?? []);
                                  if (current.has(member.id)) current.delete(member.id);
                                  else current.add(member.id);
                                  return {
                                    ...draft,
                                    gig: {
                                      ...(draft.gig ?? {}),
                                      lineupMemberIds: Array.from(current)
                                    }
                                  };
                                })
                              }
                            />
                            <span>{member.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Deps (Substitutes)</h4>
                      <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 text-xs"
                        onClick={() =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              deps: [...(draft.gig?.deps ?? []), { name: '', role: '', contact: '' }]
                            }
                          }))
                        }
                      >
                        Add dep
                      </button>
                    </div>
                    {(editor.metadata.gig?.deps ?? []).map((dep, index) => (
                      <div key={`dep-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-950/80 p-2 md:grid-cols-4">
                        <input
                          value={dep.name}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const deps = [...(draft.gig?.deps ?? [])];
                              deps[index] = { ...deps[index], name: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), deps } };
                            })
                          }
                          placeholder="Name"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={dep.role ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const deps = [...(draft.gig?.deps ?? [])];
                              deps[index] = { ...deps[index], role: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), deps } };
                            })
                          }
                          placeholder="Role"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={dep.contact ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const deps = [...(draft.gig?.deps ?? [])];
                              deps[index] = { ...deps[index], contact: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), deps } };
                            })
                          }
                          placeholder="Contact"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <button
                          type="button"
                          className="h-10 rounded-md border border-rose-700/60 text-sm text-rose-200"
                          onClick={() =>
                            updateMetadata((draft) => {
                              const deps = [...(draft.gig?.deps ?? [])];
                              deps.splice(index, 1);
                              return { ...draft, gig: { ...(draft.gig ?? {}), deps } };
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Attachments (References)</h4>
                      <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 text-xs"
                        onClick={() =>
                          updateMetadata((draft) => ({
                            ...draft,
                            gig: {
                              ...(draft.gig ?? {}),
                              attachments: [...(draft.gig?.attachments ?? []), { label: '', kind: 'contract', url: '' }]
                            }
                          }))
                        }
                      >
                        Add attachment
                      </button>
                    </div>
                    {(editor.metadata.gig?.attachments ?? []).map((attachment, index) => (
                      <div key={`attachment-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-950/80 p-2 md:grid-cols-4">
                        <input
                          value={attachment.label}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const attachments = [...(draft.gig?.attachments ?? [])];
                              attachments[index] = { ...attachments[index], label: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), attachments } };
                            })
                          }
                          placeholder="Label"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={attachment.kind ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const attachments = [...(draft.gig?.attachments ?? [])];
                              attachments[index] = { ...attachments[index], kind: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), attachments } };
                            })
                          }
                          placeholder="Kind"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <input
                          value={attachment.url ?? ''}
                          onChange={(event) =>
                            updateMetadata((draft) => {
                              const attachments = [...(draft.gig?.attachments ?? [])];
                              attachments[index] = { ...attachments[index], url: event.target.value };
                              return { ...draft, gig: { ...(draft.gig ?? {}), attachments } };
                            })
                          }
                          placeholder="URL"
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        />
                        <button
                          type="button"
                          className="h-10 rounded-md border border-rose-700/60 text-sm text-rose-200"
                          onClick={() =>
                            updateMetadata((draft) => {
                              const attachments = [...(draft.gig?.attachments ?? [])];
                              attachments.splice(index, 1);
                              return { ...draft, gig: { ...(draft.gig ?? {}), attachments } };
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {editor.type === 'GIG' && editor.mode === 'edit' && selectedEventId ? (
                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Staffing Offers</h3>
                      <p className="text-xs text-slate-400">Cascade ranked candidates by role with one active offer at a time.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={newRole}
                        onChange={(event) => setNewRole(event.target.value as StaffRole)}
                        className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      >
                        {STAFF_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-slate-700 px-3 text-sm"
                        onClick={addStaffingRole}
                      >
                        Add role
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded-md bg-cyan-500 px-3 text-sm font-semibold text-slate-950"
                        onClick={saveStaffingPlan}
                        disabled={upsertStaffingRequirements.isPending}
                      >
                        {upsertStaffingRequirements.isPending ? 'Saving…' : 'Save staffing plan'}
                      </button>
                    </div>
                  </div>

                  {staffingGigQuery.isLoading ? <p className="text-xs text-slate-500">Loading staffing state…</p> : null}

                  <div className="space-y-3">
                    {staffingDraft.length === 0 ? (
                      <p className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-500">
                        No role requirements yet. Add a role and save to start cascading offers.
                      </p>
                    ) : null}

                    {staffingDraft.map((entry) => {
                      const live = staffingRequirements.find((requirement) => requirement.role === entry.role);
                      const confirmed = live?.assignments.filter((assignment) => assignment.status === 'CONFIRMED') ?? [];
                      const pendingAttempt = live?.attempts.find((attempt) => !attempt.respondedAt && new Date(attempt.expiresAt).getTime() > Date.now());

                      return (
                        <article key={entry.role} className="space-y-2 rounded-md border border-slate-800 bg-slate-950/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{entry.role}</p>
                              <p className="text-xs text-slate-400">
                                Status: {live?.status ?? 'UNFILLED'}{live?.offersPaused ? ' (paused)' : ''}
                              </p>
                              {confirmed.length > 0 ? (
                                <p className="text-xs text-emerald-200">
                                  Assigned: {confirmed.map((assignment) => assignment.personName).join(', ')}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <label className="text-xs uppercase tracking-[0.12em] text-slate-400">
                                Qty
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={entry.quantity}
                                  onChange={(event) =>
                                    updateStaffingDraft(entry.role, (current) => ({
                                      ...current,
                                      quantity: Number(event.target.value) || 1
                                    }))
                                  }
                                  className="ml-2 h-10 w-16 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm"
                                />
                              </label>
                              <button
                                type="button"
                                className="min-h-11 rounded-md border border-rose-700/50 px-3 text-xs text-rose-200"
                                onClick={() => removeStaffingRole(entry.role)}
                              >
                                Remove role
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            {[0, 1, 2].map((rankIndex) => (
                              <label key={`${entry.role}-${rankIndex}`} className="text-xs uppercase tracking-[0.12em] text-slate-400">
                                Choice {rankIndex + 1}
                                <select
                                  value={entry.rankedPersonIds[rankIndex] ?? ''}
                                  onChange={(event) =>
                                    updateStaffingDraft(entry.role, (current) => {
                                      const next = [...current.rankedPersonIds];
                                      next[rankIndex] = event.target.value;
                                      const deduped = next.filter((value) => value.length > 0).filter((value, index, all) => all.indexOf(value) === index);
                                      return {
                                        ...current,
                                        rankedPersonIds: deduped
                                      };
                                    })
                                  }
                                  className="mt-1 min-h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                                >
                                  <option value="">Unassigned</option>
                                  {staffingPeople.map((person) => (
                                    <option key={`${entry.role}-${rankIndex}-${person.id}`} value={person.id}>
                                      {person.name} ({person.email})
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="min-h-11 rounded-md border border-slate-700 px-3 text-xs"
                              onClick={() => live?.id && runStaffingAction('start', live.id)}
                              disabled={!live?.id || startStaffingOffers.isPending}
                            >
                              Start offers
                            </button>
                            <button
                              type="button"
                              className="min-h-11 rounded-md border border-slate-700 px-3 text-xs"
                              onClick={() => live?.id && runStaffingAction('pause', live.id)}
                              disabled={!live?.id || pauseStaffingOffers.isPending}
                            >
                              Pause offers
                            </button>
                            <button
                              type="button"
                              className="min-h-11 rounded-md border border-slate-700 px-3 text-xs"
                              onClick={() => live?.id && runStaffingAction('skip', live.id)}
                              disabled={!live?.id || !pendingAttempt || skipStaffingCandidate.isPending}
                            >
                              Skip candidate
                            </button>
                            <button
                              type="button"
                              className="min-h-11 rounded-md border border-slate-700 px-3 text-xs"
                              onClick={() => live?.id && runStaffingAction('resend', live.id)}
                              disabled={!live?.id || !pendingAttempt || resendStaffingOffer.isPending}
                            >
                              Resend offer
                            </button>

                            <select
                              value={manualAssignPersonByRequirement[live?.id ?? ''] ?? ''}
                              onChange={(event) =>
                                live?.id &&
                                setManualAssignPersonByRequirement((current) => ({
                                  ...current,
                                  [live.id]: event.target.value
                                }))
                              }
                              className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs"
                              disabled={!live?.id}
                            >
                              <option value="">Manual assign…</option>
                              {staffingPeople.map((person) => (
                                <option key={`${entry.role}-manual-${person.id}`} value={person.id}>
                                  {person.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="min-h-11 rounded-md border border-cyan-600/60 px-3 text-xs text-cyan-100"
                              onClick={() => live?.id && runStaffingAction('assign-manual', live.id)}
                              disabled={!live?.id || !manualAssignPersonByRequirement[live.id] || assignStaffingManual.isPending}
                            >
                              Assign manually
                            </button>
                          </div>

                          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Offer attempts</p>
                            <div className="mt-2 space-y-1">
                              {live?.attempts.length ? null : <p className="text-xs text-slate-500">No attempts yet.</p>}
                              {live?.attempts.map((attempt) => {
                                const status = attempt.respondedAt
                                  ? attempt.response === 'YES'
                                    ? 'ACCEPTED'
                                    : 'DECLINED'
                                  : new Date(attempt.expiresAt).getTime() <= Date.now()
                                    ? 'EXPIRED'
                                    : 'PENDING';

                                return (
                                  <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1 text-xs">
                                    <p>
                                      #{attempt.id.slice(0, 6)} · {attempt.personName}
                                    </p>
                                    <p className="text-slate-400">
                                      {status} · sent {new Date(attempt.sentAt).toLocaleString()}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Candidate Directory</p>
                    <p className="mt-1 text-xs text-slate-500">Add reusable candidates for ranked role lists (band members or deps).</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input
                        value={newCandidateName}
                        onChange={(event) => setNewCandidateName(event.target.value)}
                        className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        placeholder="Full name"
                      />
                      <input
                        value={newCandidateEmail}
                        onChange={(event) => setNewCandidateEmail(event.target.value)}
                        className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                        placeholder="Email"
                        type="email"
                      />
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-slate-700 px-3 text-sm"
                        onClick={onCreateCandidate}
                        disabled={createStaffingPerson.isPending || !newCandidateName.trim() || !newCandidateEmail.trim()}
                      >
                        {createStaffingPerson.isPending ? 'Adding…' : 'Add candidate'}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {STAFF_ROLES.map((role) => (
                        <label key={`candidate-role-${role}`} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-2 text-xs">
                          <input
                            type="checkbox"
                            checked={newCandidateRoles.has(role)}
                            onChange={() =>
                              setNewCandidateRoles((current) => {
                                const next = new Set(current);
                                if (next.has(role)) next.delete(role);
                                else next.add(role);
                                return next;
                              })
                            }
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {editor.type === 'REHEARSAL' ? (
                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <h3 className="text-sm font-semibold text-slate-100">Rehearsal Details</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Objective
                      <textarea
                        value={editor.metadata.rehearsal?.objective ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            rehearsal: {
                              ...(draft.rehearsal ?? {}),
                              objective: event.target.value
                            }
                          }))
                        }
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Location
                      <input
                        value={editor.metadata.rehearsal?.location ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            rehearsal: {
                              ...(draft.rehearsal ?? {}),
                              location: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                  </div>

                  <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Duration (minutes)
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={editor.metadata.rehearsal?.durationMinutes ?? ''}
                      onChange={(event) =>
                        updateMetadata((draft) => ({
                          ...draft,
                          rehearsal: {
                            ...(draft.rehearsal ?? {}),
                            durationMinutes: event.target.value ? Number(event.target.value) : undefined
                          }
                        }))
                      }
                      className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Required Lineup</h4>
                      <p className="text-xs text-slate-500">Choose members expected at rehearsal</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {members.map((member) => {
                        const selected = (editor.metadata.rehearsal?.requiredLineupMemberIds ?? []).includes(member.id);
                        return (
                          <label key={member.id} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                updateMetadata((draft) => {
                                  const set = new Set(draft.rehearsal?.requiredLineupMemberIds ?? []);
                                  if (set.has(member.id)) set.delete(member.id);
                                  else set.add(member.id);
                                  return {
                                    ...draft,
                                    rehearsal: {
                                      ...(draft.rehearsal ?? {}),
                                      requiredLineupMemberIds: Array.from(set)
                                    }
                                  };
                                })
                              }
                            />
                            <span>{member.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              {editor.type === 'TRAVEL' ? (
                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <h3 className="text-sm font-semibold text-slate-100">Travel Details</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Origin
                      <input
                        value={editor.metadata.travel?.origin ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            travel: {
                              ...(draft.travel ?? {}),
                              origin: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Destination
                      <input
                        value={editor.metadata.travel?.destination ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            travel: {
                              ...(draft.travel ?? {}),
                              destination: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Depart
                      <input
                        type="datetime-local"
                        value={editor.metadata.travel?.departAt ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            travel: {
                              ...(draft.travel ?? {}),
                              departAt: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                      Arrive
                      <input
                        type="datetime-local"
                        value={editor.metadata.travel?.arriveAt ?? ''}
                        onChange={(event) =>
                          updateMetadata((draft) => ({
                            ...draft,
                            travel: {
                              ...(draft.travel ?? {}),
                              arriveAt: event.target.value
                            }
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                      />
                    </label>
                  </div>
                  <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Travel Notes
                    <textarea
                      value={editor.metadata.travel?.notes ?? ''}
                      onChange={(event) =>
                        updateMetadata((draft) => ({
                          ...draft,
                          travel: {
                            ...(draft.travel ?? {}),
                            notes: event.target.value
                          }
                        }))
                      }
                      className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                  </label>
                </section>
              ) : null}

              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="text-sm font-semibold text-slate-100">Conflicts</h3>
                {editorConflicts ? (
                  <div className="mt-2 space-y-2 text-xs">
                    {editorConflicts.unavailableMembers.length > 0 ? (
                      <p className="rounded-md border border-rose-700/40 bg-rose-900/20 px-2 py-1 text-rose-200">
                        Unavailable members: {editorConflicts.unavailableMembers.map((entry) => members.find((m) => m.id === entry.userId)?.name ?? entry.userId).join(', ')}
                      </p>
                    ) : null}
                    {editorConflicts.doubleBookedMembers.length > 0 ? (
                      <p className="rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-amber-200">
                        Double-booked members: {editorConflicts.doubleBookedMembers.map((entry) => members.find((m) => m.id === entry.userId)?.name ?? entry.userId).join(', ')}
                      </p>
                    ) : null}
                    {editorConflicts.travelOverlaps.length > 0 ? (
                      <p className="rounded-md border border-cyan-700/40 bg-cyan-900/20 px-2 py-1 text-cyan-200">
                        Overlaps travel block(s): {editorConflicts.travelOverlaps.map((event) => event.title).join(', ')}
                      </p>
                    ) : null}
                    {editorConflicts.unavailableMembers.length === 0 &&
                    editorConflicts.doubleBookedMembers.length === 0 &&
                    editorConflicts.travelOverlaps.length === 0 ? (
                      <p className="rounded-md border border-emerald-700/40 bg-emerald-900/20 px-2 py-1 text-emerald-200">No conflicts detected for this entry.</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {editor.mode === 'edit' && selectedEventId ? (
                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">Availability</h3>
                    <button
                      type="button"
                      className="rounded border border-slate-700 px-2 py-1 text-xs"
                      onClick={ensureAvailabilityRequest}
                      disabled={Boolean(selectedRequest) || createAvailabilityRequest.isPending}
                      title={selectedRequest ? 'Availability request already exists' : 'Create request for this event'}
                    >
                      {selectedRequest ? 'Request Created' : createAvailabilityRequest.isPending ? 'Creating…' : 'Create Request'}
                    </button>
                  </div>

                  {!selectedRequest ? <p className="text-xs text-slate-500">No availability request yet for this event.</p> : null}

                  {selectedRequest ? (
                    <div className="space-y-2">
                      {members.map((member) => {
                        const status = getMemberResponse(member.id);
                        return (
                          <div key={member.id} className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-950/80 p-2 md:grid-cols-[1fr_160px_1fr]">
                            <p className="self-center text-sm text-slate-100">{member.name}</p>
                            <select
                              value={status}
                              onChange={(event) => onMemberResponseChange(member.id, event.target.value as AvailabilityValue)}
                              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm"
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="YES">AVAILABLE</option>
                              <option value="MAYBE">MAYBE</option>
                              <option value="NO">UNAVAILABLE</option>
                            </select>
                            <input
                              value={availabilityNotesDraft[member.id] ?? selectedRequest.responses.find((item) => item.userId === member.id)?.notes ?? ''}
                              onChange={(event) =>
                                setAvailabilityNotesDraft((current) => ({
                                  ...current,
                                  [member.id]: event.target.value
                                }))
                              }
                              onBlur={() => onAvailabilityNoteBlur(member.id)}
                              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
                              placeholder="Reason (optional)"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {editorError ? <p className="text-sm text-rose-300">{editorError}</p> : null}

              <div className="flex items-center justify-end gap-2">
                <button type="button" className="h-11 rounded-md border border-slate-700 px-4 text-sm" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-md bg-cyan-500 px-4 text-sm font-semibold text-slate-950"
                  disabled={createEvent.isPending || updateEvent.isPending}
                >
                  {editor.mode === 'create'
                    ? createEvent.isPending
                      ? 'Creating…'
                      : 'Create Entry'
                    : updateEvent.isPending
                      ? 'Saving…'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
