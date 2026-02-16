'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useSync } from '@/lib/hooks/use-sync';
import { useBranding } from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';
import { LoginCard } from './login-card';
import { navItems } from './nav-items';
import { SyncPill } from './sync-pill';

function NavLinks({ close }: { close?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition ${
              active
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sync = useSync();
  const runSync = () => sync.mutate();

  const user = useAppStore((s) => s.user);
  const bandId = useAppStore((s) => s.activeBandId);
  const setBandId = useAppStore((s) => s.setActiveBandId);

  const host = typeof window === 'undefined' ? '' : window.location.host;
  const brandingQuery = useBranding(host);

  const title = useMemo(() => {
    const brandedName = brandingQuery.data?.displayName;
    if (typeof brandedName === 'string' && brandedName.length > 0) {
      return brandedName;
    }
    return 'StageOS';
  }, [brandingQuery.data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_90%_10%,rgba(14,165,233,0.2),transparent_35%),#04070d] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 lg:hidden"
              aria-label="Open navigation"
            >
              ≡
            </button>
            <p className="text-lg font-semibold tracking-tight text-cyan-100">{title}</p>
          </div>

          <div className="flex items-center gap-3">
            {user?.memberships?.length ? (
              <select
                className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                value={bandId ?? ''}
                onChange={(event) => setBandId(event.target.value)}
              >
                {user.memberships.map((membership) => (
                  <option key={membership.bandId} value={membership.bandId}>
                    {membership.band.name}
                  </option>
                ))}
              </select>
            ) : null}
            <SyncPill onSync={runSync} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1800px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:py-6">
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <NavLinks />
            <LoginCard />
          </div>
        </aside>

        <main className="min-h-[80vh]">{children}</main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            className="flex-1 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="w-[min(82vw,320px)] border-l border-slate-800 bg-slate-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Navigation</p>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-200"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <NavLinks close={() => setDrawerOpen(false)} />
            <div className="mt-4">
              <LoginCard />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
