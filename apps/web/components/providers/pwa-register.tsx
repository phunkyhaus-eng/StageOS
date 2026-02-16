'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Service worker registration errors should not block app boot.
      }
    };

    void register();
  }, []);

  return null;
}
