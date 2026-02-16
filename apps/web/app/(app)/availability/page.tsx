'use client';

import { Panel } from '@/components/ui/panel';
import { useAvailabilityGrid } from '@/lib/hooks/use-stageos-data';

export default function AvailabilityPage() {
  const grid = useAvailabilityGrid();

  const rows = (grid.data?.rows as Array<Record<string, unknown>> | undefined) ?? [];
  const requests = (grid.data?.requests as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <Panel
      title="Availability Workflow"
      subtitle="Create request → collect responses → detect conflicts → lock roster"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900/90 px-3 py-2 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                Member
              </th>
              {requests.map((request) => (
                <th key={String(request.id)} className="px-3 py-2 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  {String(request.eventTitle)}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.16em] text-slate-500">Conflicts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const user = row.user as { name: string };
              const responses = (row.responses as Array<Record<string, unknown>> | undefined) ?? [];
              const conflicts = (row.doubleBookings as Array<Record<string, unknown>> | undefined) ?? [];

              return (
                <tr key={String(user.name)} className="align-top">
                  <td className="sticky left-0 z-10 rounded-l-lg border border-slate-800 bg-slate-900/95 px-3 py-2 font-medium text-slate-100">
                    {user.name}
                  </td>
                  {responses.map((response) => (
                    <td key={String(response.requestId)} className="border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ${
                          response.value === 'YES'
                            ? 'bg-emerald-300/20 text-emerald-200'
                            : response.value === 'NO'
                              ? 'bg-rose-300/20 text-rose-200'
                              : response.value === 'MAYBE'
                                ? 'bg-amber-300/20 text-amber-200'
                                : 'bg-slate-700/60 text-slate-200'
                        }`}
                      >
                        {String(response.value)}
                      </span>
                    </td>
                  ))}
                  <td className="rounded-r-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-rose-300">
                    {conflicts.length ? `${conflicts.length} overlap(s)` : 'None'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
