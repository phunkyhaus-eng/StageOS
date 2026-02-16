'use client';

import { Panel } from '@/components/ui/panel';
import { useSetlists } from '@/lib/hooks/use-stageos-data';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function SetlistsPage() {
  const setlists = useSetlists();

  return (
    <Panel title="Setlists & Repertoire" subtitle="Versioned repertoire with locked per-event lists">
      <div className="space-y-3">
        {(setlists.data ?? []).map((setlist) => {
          const items = (setlist.items as Array<Record<string, unknown>> | undefined) ?? [];
          const duration = Number(setlist.totalDurationSec ?? 0);

          return (
            <article key={String(setlist.id)} className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">{String(setlist.name)}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
                    {items.length} songs
                  </span>
                  <span className="rounded-full border border-cyan-500/40 px-2 py-1 text-cyan-200">
                    {formatDuration(duration)}
                  </span>
                  <span className={`rounded-full px-2 py-1 ${setlist.locked ? 'bg-rose-400/20 text-rose-200' : 'bg-emerald-400/20 text-emerald-200'}`}>
                    {setlist.locked ? 'Locked' : 'Editable'}
                  </span>
                </div>
              </div>
              <ol className="mt-3 space-y-1 text-xs text-slate-300">
                {items.map((item) => {
                  const version = item.songVersion as Record<string, unknown>;
                  const song = version?.song as Record<string, unknown>;
                  return (
                    <li key={String(item.id)} className="rounded-md border border-slate-800 px-2 py-1">
                      {String(song?.title ?? 'Untitled')} • {String(version?.name ?? 'Version')} •{' '}
                      {formatDuration(Number(item.durationSec ?? 0))}
                    </li>
                  );
                })}
              </ol>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
