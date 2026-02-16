'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  organisationId: string;
  memberships: Array<{
    bandId: string;
    roleName: string;
    band: {
      name: string;
    };
  }>;
}

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface AppStore {
  accessToken: string | null;
  user: SessionUser | null;
  activeBandId: string | null;
  deviceId: string;
  syncStatus: SyncStatus;
  pendingOps: number;
  conflictCount: number;
  setAccessToken: (token: string | null) => void;
  setUser: (user: SessionUser | null) => void;
  setActiveBandId: (bandId: string | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setPendingOps: (count: number) => void;
  setConflictCount: (count: number) => void;
  signOut: () => void;
}

function createDeviceId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `stageos-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      activeBandId: null,
      deviceId: createDeviceId(),
      syncStatus: 'idle',
      pendingOps: 0,
      conflictCount: 0,
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) =>
        set((state) => ({
          user,
          activeBandId: state.activeBandId ?? user?.memberships?.[0]?.bandId ?? null
        })),
      setActiveBandId: (activeBandId) => set({ activeBandId }),
      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setPendingOps: (pendingOps) => set({ pendingOps }),
      setConflictCount: (conflictCount) => set({ conflictCount }),
      signOut: () =>
        set({
          accessToken: null,
          user: null,
          activeBandId: null,
          pendingOps: 0,
          conflictCount: 0,
          syncStatus: 'idle'
        })
    }),
    {
      name: 'stageos-web-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        activeBandId: state.activeBandId,
        deviceId: state.deviceId
      })
    }
  )
);
