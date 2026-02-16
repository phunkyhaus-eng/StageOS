'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { queueLocalWrite } from '../offline/sync-engine';
import { useAppStore } from '../state/app-store';

function useSession() {
  const token = useAppStore((s) => s.accessToken);
  const bandId = useAppStore((s) => s.activeBandId);
  return { token, bandId };
}

function withAuth<T>(token: string | null, fn: () => Promise<T>) {
  if (!token) {
    return Promise.reject(new Error('Missing access token'));
  }
  return fn();
}

function extractApiErrorMessage(error: ApiError): string {
  if (typeof error.payload === 'string' && error.payload.trim().length > 0) {
    return error.payload;
  }

  if (typeof error.payload === 'object' && error.payload !== null) {
    const payload = error.payload as Record<string, unknown>;
    const message = payload.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
    if (Array.isArray(message) && message.length > 0) {
      const first = message[0];
      if (typeof first === 'string' && first.trim().length > 0) {
        return first;
      }
    }
  }

  return error.message;
}

export function useEvents(options?: { page?: number; pageSize?: number }) {
  const { token, bandId } = useSession();
  const query = new URLSearchParams();
  if (bandId) query.set('bandId', bandId);
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));

  return useQuery({
    queryKey: ['events', bandId, options?.page, options?.pageSize],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () => apiFetch<{ items: Array<Record<string, unknown>> }>(`/events?${query.toString()}`, { token }))
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      startsAt: string;
      endsAt?: string;
      venueName?: string;
      address?: string;
      notes?: string;
      mapUrl?: string;
      allDay?: boolean;
      type?: string;
      status?: string;
      metadataJson?: Record<string, unknown>;
      kind?: 'BOOKING' | 'POTENTIAL' | 'TRAVEL_DAY';
    }) => {
      if (!bandId) {
        throw new Error('Missing active band');
      }

      const mappedTypeStatus =
        payload.kind === 'BOOKING'
          ? { type: 'GIG', status: 'CONFIRMED' }
          : payload.kind === 'TRAVEL_DAY'
            ? { type: 'TRAVEL', status: 'CONFIRMED' }
            : { type: 'HOLD', status: 'TENTATIVE' };

      const body = {
        bandId,
        title: payload.title,
        type: payload.type ?? mappedTypeStatus.type,
        status: payload.status ?? mappedTypeStatus.status,
        startsAt: payload.startsAt,
        ...(payload.endsAt ? { endsAt: payload.endsAt } : {}),
        allDay: payload.allDay ?? false,
        venueName: payload.venueName,
        address: payload.address,
        mapUrl: payload.mapUrl,
        notes: payload.notes,
        metadataJson: payload.metadataJson
      };

      try {
        const created = await withAuth(token, () =>
          apiFetch<Record<string, unknown>>('/events', {
            method: 'POST',
            token,
            body
          })
        );

        // Best-effort linking for availability; event creation remains the source of truth.
        try {
          await withAuth(token, () =>
            apiFetch<Record<string, unknown>>('/availability/requests', {
              method: 'POST',
              token,
              body: {
                bandId,
                eventId: String(created.id),
                targetGroup: 'band-members'
              }
            })
          );
        } catch {
          // Ignore secondary availability request failures here.
        }

        return created;
      } catch (error) {
        // Only queue local writes for network-level failures.
        // API validation/auth errors should surface directly to the user.
        if (error instanceof ApiError) {
          throw new Error(extractApiErrorMessage(error));
        }

        const offlineId = crypto.randomUUID();
        await queueLocalWrite({
          entity: 'EVENT',
          operation: 'create',
          entityId: offlineId,
          bandId,
          payload: body
        });

        return {
          id: offlineId,
          ...body,
          _offline: true
        };
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events', bandId] });
    }
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      patch: {
        title?: string;
        type?: string;
        status?: string;
        startsAt?: string;
        endsAt?: string;
        allDay?: boolean;
        venueName?: string;
        address?: string;
        mapUrl?: string;
        notes?: string;
        metadataJson?: Record<string, unknown> | null;
      };
    }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/events/${input.eventId}`, {
          method: 'PUT',
          token,
          body: input.patch
        })
      ),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['events', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['event-detail', input.eventId] });
      await queryClient.invalidateQueries({ queryKey: ['availability-requests', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['availability-grid', bandId] });
    }
  });
}

export function useEventDetail(eventId: string | null) {
  const { token } = useSession();

  return useQuery({
    queryKey: ['event-detail', eventId],
    enabled: Boolean(token && eventId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, unknown>>(`/events/${eventId}`, { token }))
  });
}

export function useStaffingGig(gigId: string | null) {
  const { token } = useSession();

  return useQuery({
    queryKey: ['staffing-gig', gigId],
    enabled: Boolean(token && gigId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, unknown>>(`/staffing/gigs/${gigId}`, { token }))
  });
}

export function useStaffingPersons() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['staffing-persons', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () => apiFetch<Array<Record<string, unknown>>>(`/staffing/persons?bandId=${bandId}`, { token }))
  });
}

export function useCreateStaffingPerson() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      email: string;
      phone?: string;
      roles?: string[];
    }) => {
      if (!bandId) throw new Error('Missing active band');
      return withAuth(token, () =>
        apiFetch<Record<string, unknown>>('/staffing/persons', {
          method: 'POST',
          token,
          body: {
            bandId,
            ...payload
          }
        })
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staffing-persons', bandId] });
    }
  });
}

export function useUpdateStaffingPerson() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (input: {
      personId: string;
      patch: {
        name?: string;
        email?: string;
        phone?: string;
        status?: 'ACTIVE' | 'INACTIVE';
        roles?: string[];
      };
    }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/staffing/persons/${input.personId}`, {
          method: 'PATCH',
          token,
          body: input.patch
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staffing-persons', bandId] });
    }
  });
}

export function useUpsertGigStaffingRequirements() {
  const queryClient = useQueryClient();
  const { token } = useSession();

  return useMutation({
    mutationFn: async (input: {
      gigId: string;
      requirements: Array<{
        role: string;
        quantity?: number;
        offerPolicy?: 'CASCADE';
        rankedPersonIds: string[];
      }>;
    }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/staffing/gigs/${input.gigId}/requirements`, {
          method: 'PUT',
          token,
          body: { requirements: input.requirements }
        })
      ),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['staffing-gig', input.gigId] });
      await queryClient.invalidateQueries({ queryKey: ['event-detail', input.gigId] });
    }
  });
}

function useRequirementAction(pathSuffix: string) {
  const queryClient = useQueryClient();
  const { token } = useSession();

  return useMutation({
    mutationFn: async (input: { requirementId: string; gigId: string; body?: Record<string, unknown> }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/staffing/requirements/${input.requirementId}/${pathSuffix}`, {
          method: 'POST',
          token,
          body: input.body
        })
      ),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['staffing-gig', input.gigId] });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['event-detail', input.gigId] });
    }
  });
}

export function useStartStaffingOffers() {
  return useRequirementAction('start');
}

export function usePauseStaffingOffers() {
  return useRequirementAction('pause');
}

export function useSkipStaffingCandidate() {
  return useRequirementAction('skip');
}

export function useResendStaffingOffer() {
  return useRequirementAction('resend');
}

export function useAssignStaffingManual() {
  const mutation = useRequirementAction('assign-manual');

  return useMutation({
    mutationFn: async (input: { requirementId: string; gigId: string; personId: string }) =>
      mutation.mutateAsync({
        requirementId: input.requirementId,
        gigId: input.gigId,
        body: {
          personId: input.personId
        }
      })
  });
}

export function useMusicianOffers() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['musician-offers', bandId],
    enabled: Boolean(token),
    queryFn: () =>
      withAuth(
        token,
        () =>
          apiFetch<Record<string, unknown>>(
            bandId ? `/staffing/musician/offers?bandId=${encodeURIComponent(bandId)}` : '/staffing/musician/offers',
            { token }
          )
      )
  });
}

export function useRespondToMusicianOffer() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (input: { attemptId: string; decision: 'YES' | 'NO' }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/staffing/musician/offers/${input.attemptId}/respond`, {
          method: 'POST',
          token,
          body: { decision: input.decision }
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['musician-offers', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['staffing-gig'] });
    }
  });
}

export function useUpdateMusicianProfile() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (input: {
      personId?: string;
      roles?: string[];
      availabilityPrefs?: Record<string, unknown>;
    }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>('/staffing/musician/profile', {
          method: 'PATCH',
          token,
          body: input
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['musician-offers', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['staffing-persons', bandId] });
    }
  });
}

export function useVerifyMusicianEmail() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (tokenValue: string) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>('/staffing/musician/verify-email', {
          method: 'POST',
          token,
          body: {
            token: tokenValue
          }
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['musician-offers', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['staffing-persons', bandId] });
    }
  });
}

export function useRespondOfferToken() {
  return useMutation({
    mutationFn: async (input: { token: string; decision: 'YES' | 'NO' }) =>
      apiFetch<Record<string, unknown>>('/staffing/offers/respond-token', {
        method: 'POST',
        body: input
      })
  });
}

export function useLeadsBoard() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['leads', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, Array<Record<string, unknown>>>>(`/leads?bandId=${bandId}`, { token }))
  });
}

export function useAvailabilityGrid(range?: { from?: string; to?: string }) {
  const { token, bandId } = useSession();
  const query = new URLSearchParams();
  if (bandId) query.set('bandId', bandId);
  if (range?.from) query.set('from', range.from);
  if (range?.to) query.set('to', range.to);

  return useQuery({
    queryKey: ['availability-grid', bandId, range?.from, range?.to],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () => apiFetch<Record<string, unknown>>(`/availability/grid?${query.toString()}`, { token }))
  });
}

export function useAvailabilityRequests(eventId?: string | null) {
  const { token, bandId } = useSession();
  const query = new URLSearchParams();
  if (bandId) query.set('bandId', bandId);
  if (eventId) query.set('eventId', eventId);

  return useQuery({
    queryKey: ['availability-requests', bandId, eventId ?? null],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () =>
        apiFetch<Array<Record<string, unknown>>>(`/availability/requests?${query.toString()}`, { token })
      )
  });
}

export function useCreateAvailabilityRequest() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (payload: {
      eventId: string;
      targetGroup?: string;
      notes?: string;
      closesAt?: string;
    }) => {
      if (!bandId) throw new Error('Missing active band');

      return withAuth(token, () =>
        apiFetch<Record<string, unknown>>('/availability/requests', {
          method: 'POST',
          token,
          body: {
            bandId,
            eventId: payload.eventId,
            targetGroup: payload.targetGroup ?? 'band-members',
            notes: payload.notes,
            closesAt: payload.closesAt
          }
        })
      );
    },
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['availability-requests', bandId, payload.eventId] });
      await queryClient.invalidateQueries({ queryKey: ['availability-grid', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['event-detail', payload.eventId] });
    }
  });
}

export function useSetMemberAvailabilityResponse() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (payload: {
      requestId: string;
      userId: string;
      response: 'PENDING' | 'YES' | 'NO' | 'MAYBE';
      notes?: string;
    }) =>
      withAuth(token, () =>
        apiFetch<Record<string, unknown>>(`/availability/requests/${payload.requestId}/member-response`, {
          method: 'POST',
          token,
          body: {
            userId: payload.userId,
            response: payload.response,
            notes: payload.notes
          }
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['availability-grid', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['availability-requests', bandId] });
      await queryClient.invalidateQueries({ queryKey: ['event-detail'] });
    }
  });
}

export function useSetlists() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['setlists', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Array<Record<string, unknown>>>(`/setlists?bandId=${bandId}`, { token }))
  });
}

export function useFinanceSummary() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['finance-summary', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, number>>(`/finance/summary?bandId=${bandId}`, { token }))
  });
}

export function useFiles() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['files', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Array<Record<string, unknown>>>(`/files?bandId=${bandId}`, { token }))
  });
}

export function useTours() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['tours', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Array<Record<string, unknown>>>(`/tours?bandId=${bandId}`, { token }))
  });
}

export function useAnalyticsOverview() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['analytics-overview', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, unknown>>(`/analytics/overview?bandId=${bandId}`, { token }))
  });
}

export function useBilling() {
  const { token } = useSession();

  return useQuery({
    queryKey: ['billing-subscription'],
    enabled: Boolean(token),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, unknown>>('/billing/subscription', { token }))
  });
}

export function usePlugins() {
  const { token } = useSession();

  return useQuery({
    queryKey: ['plugins'],
    enabled: Boolean(token),
    queryFn: () => withAuth(token, () => apiFetch<Array<Record<string, unknown>>>('/plugins', { token }))
  });
}

export function useBranding(host: string) {
  return useQuery({
    queryKey: ['branding', host],
    enabled: Boolean(host),
    queryFn: () => apiFetch<Record<string, unknown> | null>(`/branding/resolve?host=${encodeURIComponent(host)}`)
  });
}
