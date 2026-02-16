'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { readConflicts, countOfflineOperations } from '../offline/indexeddb';
import { runSync } from '../offline/sync-engine';
import { useAppStore } from '../state/app-store';

export function useSync() {
  const token = useAppStore((s) => s.accessToken);
  const bandId = useAppStore((s) => s.activeBandId);
  const deviceId = useAppStore((s) => s.deviceId);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);
  const setPendingOps = useAppStore((s) => s.setPendingOps);
  const setConflictCount = useAppStore((s) => s.setConflictCount);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!token || !bandId) {
        return null;
      }

      const result = await runSync({ token, bandId, deviceId });
      setPendingOps(result.pending);
      const conflicts = await readConflicts();
      setConflictCount(conflicts.length);
      return result;
    },
    onMutate: () => {
      setSyncStatus('syncing');
    },
    onSuccess: () => {
      setSyncStatus('idle');
    },
    onError: () => {
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    }
  });

  useEffect(() => {
    const refresh = async () => {
      const pending = await countOfflineOperations();
      setPendingOps(pending);
      const conflicts = await readConflicts();
      setConflictCount(conflicts.length);
    };

    void refresh();
  }, [setConflictCount, setPendingOps]);

  useEffect(() => {
    const onOnline = () => {
      setSyncStatus('idle');
      if (token && bandId) {
        mutation.mutate();
      }
    };

    const onOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [bandId, mutation, setSyncStatus, token]);

  return mutation;
}
