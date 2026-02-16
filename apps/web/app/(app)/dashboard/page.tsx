'use client';

import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { useAnalyticsOverview, useBilling, useEvents, useFinanceSummary } from '@/lib/hooks/use-stageos-data';

function formatCurrency(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function DashboardPage() {
  const events = useEvents();
  const finance = useFinanceSummary();
  const analytics = useAnalyticsOverview();
  const billing = useBilling();

  const eventCount = (events.data?.items ?? []).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Upcoming Events" value={String(eventCount)} hint="Live + rehearsal + travel" />
        <KpiCard
          label="Invoice Total"
          value={formatCurrency(finance.data?.invoiceTotal)}
          hint="Gross billed"
        />
        <KpiCard
          label="Projected Profit"
          value={formatCurrency(finance.data ? finance.data.invoiceTotal - finance.data.expenseTotal - finance.data.payoutTotal : 0)}
          hint="Invoices - expenses - payouts"
        />
        <KpiCard
          label="Subscription"
          value={String((billing.data?.tier as string | undefined) ?? 'FREE')}
          hint={String((billing.data?.status as string | undefined) ?? 'ACTIVE')}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Revenue Intelligence" subtitle="Conversion and profitability snapshot">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3">
              <dt className="text-slate-400">Conversion Rate</dt>
              <dd className="mt-1 text-lg font-semibold text-cyan-100">
                {(((analytics.data?.summary as { conversionRate?: number } | undefined)?.conversionRate ?? 0) * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3">
              <dt className="text-slate-400">Average Gig Profit</dt>
              <dd className="mt-1 text-lg font-semibold text-cyan-100">
                {formatCurrency((analytics.data?.summary as { avgGigProfit?: number } | undefined)?.avgGigProfit)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3">
              <dt className="text-slate-400">Availability Reliability</dt>
              <dd className="mt-1 text-lg font-semibold text-cyan-100">
                {(((analytics.data?.summary as { availabilityReliability?: number } | undefined)?.availabilityReliability ?? 0) * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3">
              <dt className="text-slate-400">Total Profit</dt>
              <dd className="mt-1 text-lg font-semibold text-cyan-100">
                {formatCurrency((analytics.data?.summary as { profit?: number } | undefined)?.profit)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Ops Pulse" subtitle="Real-time operational events">
          <ul className="space-y-2 text-sm text-slate-300">
            {(events.data?.items ?? []).slice(0, 6).map((event) => (
              <li key={String(event.id)} className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
                <p className="font-medium text-slate-100">{String(event.title)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(String(event.startsAt)).toLocaleString()} • {String(event.venueName ?? 'TBA')}
                </p>
              </li>
            ))}
            {eventCount === 0 ? <li className="text-slate-500">No upcoming events.</li> : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
