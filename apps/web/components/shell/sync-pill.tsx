'use client';

import { useAppStore } from '@/lib/state/app-store';

export function SyncPill({ onSync }: { onSync: () => void }) {
  const status = useAppStore((s) => s.syncStatus);
  const pending = useAppStore((s) => s.pendingOps);
  const conflicts = useAppStore((s) => s.conflictCount);

  const statusLabel =
    status === 'syncing'
      ? 'Syncing'
      : status === 'offline'
        ? 'Offline'
        : status === 'error'
          ? 'Sync Error'
          : 'Synced';

  return (
    <button
      type="button"
      onClick={onSync}
      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
    >
      <span>{statusLabel}</span>
      <span className="rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px]">
        {pending} pending
      </span>
      {conflicts > 0 ? (
        <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[11px] text-amber-200">
          {conflicts} conflicts
        </span>
      ) : null}
    </button>
  );
}
