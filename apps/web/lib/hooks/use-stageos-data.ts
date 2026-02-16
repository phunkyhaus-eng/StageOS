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

export function useEvents() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['events', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () => apiFetch<{ items: Array<Record<string, unknown>> }>('/events?bandId=' + bandId, { token }))
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { token, bandId } = useSession();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      startsAt: string;
      endsAt: string;
      venueName?: string;
      address?: string;
    }) => {
      if (!bandId) {
        throw new Error('Missing active band');
      }

      const body = {
        bandId,
        title: payload.title,
        type: 'GIG',
        status: 'PLANNED',
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        venueName: payload.venueName,
        address: payload.address
      };

      try {
        return await withAuth(token, () =>
          apiFetch<Record<string, unknown>>('/events', {
            method: 'POST',
            token,
            body
          })
        );
      } catch (error) {
        if (error instanceof ApiError && error.status >= 500) {
          throw error;
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

export function useLeadsBoard() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['leads', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => withAuth(token, () => apiFetch<Record<string, Array<Record<string, unknown>>>>(`/leads?bandId=${bandId}`, { token }))
  });
}

export function useAvailabilityGrid() {
  const { token, bandId } = useSession();

  return useQuery({
    queryKey: ['availability-grid', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () =>
      withAuth(token, () => apiFetch<Record<string, unknown>>(`/availability/grid?bandId=${bandId}`, { token }))
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
