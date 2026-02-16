'use client';

import { useQuery } from '@tanstack/react-query';
import { Panel } from '@/components/ui/panel';
import { apiFetch } from '@/lib/api-client';
import { useFinanceSummary } from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';

function money(value: number | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
}

export default function FinancePage() {
  const summary = useFinanceSummary();
  const token = useAppStore((s) => s.accessToken);
  const bandId = useAppStore((s) => s.activeBandId);

  const invoices = useQuery({
    queryKey: ['finance-invoices', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => apiFetch<Array<Record<string, unknown>>>(`/finance/invoices?bandId=${bandId}`, { token })
  });

  const expenses = useQuery({
    queryKey: ['finance-expenses', bandId],
    enabled: Boolean(token && bandId),
    queryFn: () => apiFetch<Array<Record<string, unknown>>>(`/finance/expenses?bandId=${bandId}`, { token })
  });

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Invoices" subtitle="Billed">
          <p className="text-2xl font-semibold text-cyan-100">{money(summary.data?.invoiceTotal)}</p>
        </Panel>
        <Panel title="Expenses" subtitle="Spent">
          <p className="text-2xl font-semibold text-rose-200">{money(summary.data?.expenseTotal)}</p>
        </Panel>
        <Panel title="Payouts" subtitle="Distributed">
          <p className="text-2xl font-semibold text-amber-200">{money(summary.data?.payoutTotal)}</p>
        </Panel>
        <Panel title="Profit" subtitle="Net">
          <p className="text-2xl font-semibold text-emerald-200">
            {money(
              summary.data
                ? summary.data.invoiceTotal - summary.data.expenseTotal - summary.data.payoutTotal
                : 0
            )}
          </p>
        </Panel>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Invoices" subtitle="PDF-ready billing records">
          <ul className="space-y-2 text-sm">
            {(invoices.data ?? []).map((invoice) => (
              <li key={String(invoice.id)} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-100">{String(invoice.invoiceNumber)}</p>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                    {String(invoice.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{money(Number(invoice.total ?? 0))}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Expenses" subtitle="Tax-ready categorized spend">
          <ul className="space-y-2 text-sm">
            {(expenses.data ?? []).map((expense) => (
              <li key={String(expense.id)} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-100">{String(expense.category)}</p>
                  <span className="text-xs text-slate-300">{money(Number(expense.amount ?? 0))}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{String(expense.description)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
