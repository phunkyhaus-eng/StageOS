'use client';

import { Panel } from '@/components/ui/panel';
import { useAnalyticsOverview } from '@/lib/hooks/use-stageos-data';

export default function AnalyticsPage() {
  const analytics = useAnalyticsOverview();

  const summary = (analytics.data?.summary as Record<string, number> | undefined) ?? {};
  const usage = (analytics.data?.featureUsage as Record<string, number> | undefined) ?? {};
  const memberPayouts = (analytics.data?.memberPayouts as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Revenue Analytics" subtitle="Conversion, margin, and operational reliability">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Revenue</dt>
            <dd className="text-lg font-semibold text-cyan-100">{Number(summary.revenue ?? 0).toFixed(0)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Expenses</dt>
            <dd className="text-lg font-semibold text-rose-200">{Number(summary.expenseTotal ?? 0).toFixed(0)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Payouts</dt>
            <dd className="text-lg font-semibold text-amber-200">{Number(summary.payoutTotal ?? 0).toFixed(0)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Profit</dt>
            <dd className="text-lg font-semibold text-emerald-200">{Number(summary.profit ?? 0).toFixed(0)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Conversion</dt>
            <dd className="text-lg font-semibold text-cyan-100">{((summary.conversionRate ?? 0) * 100).toFixed(1)}%</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">Reliability</dt>
            <dd className="text-lg font-semibold text-cyan-100">{((summary.availabilityReliability ?? 0) * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Feature Usage" subtitle="Active modules across org usage telemetry">
          <ul className="space-y-2 text-sm text-slate-200">
            {Object.entries(usage)
              .sort((a, b) => b[1] - a[1])
              .map(([feature, count]) => (
                <li key={feature} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                  <span>{feature}</span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{count}</span>
                </li>
              ))}
          </ul>
        </Panel>

        <Panel title="Member Payouts" subtitle="Aggregated payout snapshots">
          <ul className="space-y-2 text-sm text-slate-200">
            {memberPayouts.map((row) => (
              <li key={String(row.userId)} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="font-medium">Member: {String(row.userId)}</p>
                <p className="text-xs text-slate-400">Entries: {String((row._count as { _all: number })._all)}</p>
                <p className="text-xs text-slate-300">
                  Amount: {String((row._sum as { amount: number | null }).amount ?? 0)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
