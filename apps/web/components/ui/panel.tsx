import { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  children,
  right
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
