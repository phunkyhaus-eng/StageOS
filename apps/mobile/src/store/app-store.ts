import { create } from 'zustand';

interface MobileStore {
  token: string | null;
  bandId: string | null;
  deviceId: string;
  pending: number;
  conflicts: number;
  setToken: (token: string | null) => void;
  setBandId: (bandId: string | null) => void;
  setPending: (pending: number) => void;
  setConflicts: (conflicts: number) => void;
}

function makeDeviceId() {
  return `mobile-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export const useMobileStore = create<MobileStore>((set) => ({
  token: null,
  bandId: null,
  deviceId: makeDeviceId(),
  pending: 0,
  conflicts: 0,
  setToken: (token) => set({ token }),
  setBandId: (bandId) => set({ bandId }),
  setPending: (pending) => set({ pending }),
  setConflicts: (conflicts) => set({ conflicts })
}));
