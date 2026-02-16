'use client';

import { FormEvent, useState } from 'react';
import { Panel } from '@/components/ui/panel';
import { useCreateEvent, useEvents } from '@/lib/hooks/use-stageos-data';

export default function EventsPage() {
  const events = useEvents();
  const createEvent = useCreateEvent();

  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title || !startsAt || !endsAt) return;

    await createEvent.mutateAsync({
      title,
      venueName: venue,
      address,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString()
    });

    setTitle('');
    setVenue('');
    setAddress('');
    setStartsAt('');
    setEndsAt('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Create Event Dossier" subtitle="Schedule, venue, and logistics context">
        <form className="space-y-3" onSubmit={onCreate}>
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            placeholder="Event title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            placeholder="Venue"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            placeholder="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <label className="block text-xs uppercase tracking-[0.16em] text-slate-400">
            Start
            <input
              type="datetime-local"
              className="mt-1 h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.16em] text-slate-400">
            End
            <input
              type="datetime-local"
              className="mt-1 h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={createEvent.isPending}
            className="h-11 w-full rounded-lg bg-cyan-500 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {createEvent.isPending ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </Panel>

      <Panel title="Event Dossiers" subtitle="Offline-cached event operations and linked data modules">
        <div className="space-y-3">
          {(events.data?.items ?? []).map((item) => (
            <article
              key={String(item.id)}
              className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">{String(item.title)}</h3>
                <span className="rounded-full border border-cyan-500/40 px-2 py-1 text-xs text-cyan-200">
                  {String(item.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {new Date(String(item.startsAt)).toLocaleString()} to{' '}
                {new Date(String(item.endsAt)).toLocaleTimeString()}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {String(item.venueName ?? 'Venue pending')} • {String(item.address ?? 'Address pending')}
              </p>
            </article>
          ))}
          {events.isLoading ? <p className="text-sm text-slate-500">Loading events...</p> : null}
        </div>
      </Panel>
    </div>
  );
}
