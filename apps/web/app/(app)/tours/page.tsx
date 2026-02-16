'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/ui/panel';
import { apiFetch } from '@/lib/api-client';
import { useTours } from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';

export default function ToursPage() {
  const tours = useTours();
  const token = useAppStore((s) => s.accessToken);
  const bandId = useAppStore((s) => s.activeBandId);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const createTour = useMutation({
    mutationFn: async () => {
      if (!token || !bandId || !name.trim()) return;
      await apiFetch('/tours', {
        method: 'POST',
        token,
        body: {
          bandId,
          name,
          startsAt: new Date().toISOString()
        }
      });
    },
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['tours', bandId] });
    }
  });

  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  const sheet = useMutation({
    mutationFn: async (tourId: string) => {
      if (!token) return null;
      return apiFetch<Record<string, unknown>>(`/tours/${tourId}/sheet`, { token });
    }
  });

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    await createTour.mutateAsync();
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Tour Builder" subtitle="Multi-day routing with fuel and break-even scoring">
        <form onSubmit={onCreate} className="space-y-3">
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            placeholder="Tour name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            disabled={createTour.isPending}
            className="h-11 w-full rounded-lg bg-cyan-500 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {createTour.isPending ? 'Creating...' : 'Create Tour'}
          </button>
        </form>
      </Panel>

      <Panel title="Tour Routing Sheets" subtitle="Distance, travel time, fuel cost, and profitability">
        <div className="space-y-3">
          {(tours.data ?? []).map((tour) => (
            <article key={String(tour.id)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{String(tour.name)}</p>
                  <p className="text-xs text-slate-400">
                    {String(tour.startsAt ? new Date(String(tour.startsAt)).toDateString() : 'Unscheduled')}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-11 rounded-lg border border-cyan-500/40 px-3 text-sm text-cyan-200"
                  onClick={async () => {
                    const id = String(tour.id);
                    setActiveTourId(id);
                    await sheet.mutateAsync(id);
                  }}
                >
                  Generate Sheet
                </button>
              </div>
            </article>
          ))}

          {activeTourId && sheet.data ? (
            <div className="rounded-xl border border-emerald-700/30 bg-emerald-900/10 p-4 text-sm">
              <p className="font-semibold text-emerald-200">Tour Sheet Ready</p>
              <p className="mt-1 text-slate-300">
                Distance: {String((sheet.data.routing as { totalDistanceKm: number }).totalDistanceKm)} km
              </p>
              <p className="text-slate-300">
                Profitability Score: {String((sheet.data.finance as { profitabilityScore: number }).profitabilityScore)}
              </p>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
