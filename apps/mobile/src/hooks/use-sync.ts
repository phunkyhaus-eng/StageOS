import { useMutation, useQuery } from '@tanstack/react-query';
import { createClientOperation } from '@stageos/shared';
import { apiRequest } from '@/lib/api';
import {
  addConflicts,
  cacheEvents,
  clearQueuedOperations,
  countConflicts,
  countQueuedOperations,
  queueOperation,
  readCachedEvents,
  readQueuedOperations
} from '@/lib/offline-db';
import { useMobileStore } from '@/store/app-store';

export function useMobileEvents() {
  const token = useMobileStore((s) => s.token);
  const bandId = useMobileStore((s) => s.bandId);

  return useQuery({
    queryKey: ['mobile-events', bandId],
    enabled: Boolean(token && bandId),
    queryFn: async () => {
      if (!token || !bandId) {
        return readCachedEvents();
      }

      try {
        const data = await apiRequest<{ items: Array<Record<string, unknown>> }>(`/events?bandId=${bandId}`, {
          token
        });

        await cacheEvents(data.items);
        return data.items;
      } catch {
        return readCachedEvents();
      }
    }
  });
}

export function useMobileSync() {
  const token = useMobileStore((s) => s.token);
  const bandId = useMobileStore((s) => s.bandId);
  const deviceId = useMobileStore((s) => s.deviceId);
  const setPending = useMobileStore((s) => s.setPending);
  const setConflicts = useMobileStore((s) => s.setConflicts);

  return useMutation({
    mutationFn: async () => {
      if (!token || !bandId) return;

      const queued = await readQueuedOperations();
      if (queued.length > 0) {
        const response = await apiRequest<{
          accepted: Array<{ clientId: string }>;
          conflicts: Array<Record<string, unknown>>;
        }>('/sync/push', {
          method: 'POST',
          token,
          body: {
            deviceId,
            bandId,
            platform: 'mobile',
            operations: queued.map((entry) => ({
              ...entry.operation,
              clientId: String(entry.id)
            }))
          }
        });

        const accepted = new Set(response.accepted.map((item) => Number(item.clientId)));
        await clearQueuedOperations(queued.filter((entry) => accepted.has(entry.id)).map((entry) => entry.id));
        await addConflicts(response.conflicts);
      }

      const pull = await apiRequest<{
        changes: Array<{
          entityType: string;
          payload: Record<string, unknown> | null;
        }>;
      }>('/sync/pull', {
        method: 'POST',
        token,
        body: {
          deviceId,
          bandId,
          limit: 300,
          platform: 'mobile'
        }
      });

      const eventPayloads = pull.changes
        .filter((change) => change.entityType === 'EVENT' && change.payload)
        .map((change) => change.payload as Record<string, unknown>);
      if (eventPayloads.length > 0) {
        await cacheEvents(eventPayloads);
      }

      setPending(await countQueuedOperations());
      setConflicts(await countConflicts());
    }
  });
}

export async function queueEventCreate(input: {
  bandId: string;
  entityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  await queueOperation(
    createClientOperation({
      clientId: `${input.entityId}:${Date.now()}`,
      entity: 'EVENT',
      operation: 'create',
      entityId: input.entityId,
      bandId: input.bandId,
      payload: {
        bandId: input.bandId,
        title: input.title,
        type: 'GIG',
        status: 'PLANNED',
        startsAt: input.startsAt,
        endsAt: input.endsAt
      }
    })
  );
}
