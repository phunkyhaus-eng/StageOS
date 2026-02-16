'use client';

import { Panel } from '@/components/ui/panel';
import { useLeadsBoard } from '@/lib/hooks/use-stageos-data';

const columns = [
  'LEAD',
  'CONTACTED',
  'NEGOTIATING',
  'CONFIRMED',
  'CONTRACT_SENT',
  'PAID',
  'COMPLETED'
] as const;

export default function CrmPage() {
  const leads = useLeadsBoard();

  return (
    <Panel title="Booking CRM Pipeline" subtitle="Kanban view with linked event conversion flow">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {columns.map((column) => {
          const items = (leads.data?.[column] as Array<Record<string, unknown>> | undefined) ?? [];

          return (
            <section key={column} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{column}</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((lead) => (
                  <article key={String(lead.id)} className="rounded-lg border border-slate-700 bg-slate-900/80 p-2">
                    <p className="text-sm font-medium text-slate-100">{String(lead.name)}</p>
                    <p className="mt-1 text-xs text-slate-400">{String(lead.contactName ?? 'No contact')}</p>
                    <p className="text-xs text-slate-500">{String(lead.contactEmail ?? 'No email')}</p>
                  </article>
                ))}
                {!items.length ? <p className="text-xs text-slate-600">No leads</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
