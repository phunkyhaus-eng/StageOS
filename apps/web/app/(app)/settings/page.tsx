'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/ui/panel';
import { apiFetch } from '@/lib/api-client';
import { useBilling, usePlugins } from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';

export default function SettingsPage() {
  const token = useAppStore((s) => s.accessToken);
  const billing = useBilling();
  const plugins = usePlugins();
  const queryClient = useQueryClient();

  const [host, setHost] = useState('localhost:3000');
  const [displayName, setDisplayName] = useState('StageOS');
  const [accentColor, setAccentColor] = useState('#38bdf8');

  const saveBranding = useMutation({
    mutationFn: async () => {
      if (!token) return;
      return apiFetch('/branding', {
        method: 'POST',
        token,
        body: {
          host,
          displayName,
          accentColor
        }
      });
    }
  });

  const checkout = useMutation({
    mutationFn: async (tier: 'PRO' | 'TOURING_PRO') => {
      if (!token) return;
      const result = await apiFetch<{ checkoutUrl: string }>('/billing/checkout', {
        method: 'POST',
        token,
        body: {
          tier,
          successUrl: `${window.location.origin}/settings`,
          cancelUrl: `${window.location.origin}/settings`
        }
      });

      window.location.href = result.checkoutUrl;
    }
  });

  const installPlugin = useMutation({
    mutationFn: async () => {
      if (!token) return;
      return apiFetch('/plugins', {
        method: 'POST',
        token,
        body: {
          key: 'demo.audit.enhancer',
          name: 'Audit Enhancer',
          version: '1.0.0',
          enabled: true,
          manifest: {
            hooks: ['event.created', 'invoice.created'],
            handler: '(payload) => ({ forwarded: true, payloadKeys: Object.keys(payload) })'
          }
        }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plugins'] });
    }
  });

  const onBrandingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await saveBranding.mutateAsync();
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Subscription & Monetization" subtitle="Stripe-backed tiering, usage metering, and grace logic">
        <p className="text-sm text-slate-300">
          Current plan: <span className="font-semibold text-cyan-100">{String(billing.data?.tier ?? 'FREE')}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">Status: {String(billing.data?.status ?? 'ACTIVE')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => checkout.mutate('PRO')}
            className="h-11 rounded-lg border border-cyan-500/40 px-4 text-sm text-cyan-200"
          >
            Upgrade to Pro
          </button>
          <button
            type="button"
            onClick={() => checkout.mutate('TOURING_PRO')}
            className="h-11 rounded-lg border border-cyan-500/40 px-4 text-sm text-cyan-200"
          >
            Upgrade to Touring Pro
          </button>
        </div>
      </Panel>

      <Panel title="White Label Branding" subtitle="Per-organization custom domain and visual identity">
        <form onSubmit={onBrandingSubmit} className="space-y-3">
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="Host"
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
            placeholder="Accent color"
          />
          <button type="submit" className="h-11 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950">
            {saveBranding.isPending ? 'Saving...' : 'Save Branding'}
          </button>
        </form>
      </Panel>

      <Panel title="Plugin Marketplace Ready Core" subtitle="Installable hooks with sandbox execution">
        <button
          type="button"
          onClick={() => installPlugin.mutate()}
          className="h-11 rounded-lg border border-cyan-500/40 px-4 text-sm text-cyan-200"
        >
          Install Demo Plugin
        </button>
        <ul className="mt-3 space-y-2 text-sm">
          {(plugins.data ?? []).map((plugin) => (
            <li key={String(plugin.id)} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <p className="font-medium text-slate-100">{String(plugin.name)}</p>
              <p className="text-xs text-slate-400">
                {String(plugin.key)} • {String(plugin.version)} • {String(plugin.status)}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Compliance & Backups" subtitle="GDPR export, deletion workflow, and retention policy">
        <div className="space-y-2 text-sm text-slate-300">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/compliance/backup-policy`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-lg border border-slate-700 px-4"
          >
            View Backup Rotation Policy
          </a>
          <p className="text-xs text-slate-500">
            Use `/compliance/export` from the API to generate full JSON+CSV GDPR exports.
          </p>
        </div>
      </Panel>
    </div>
  );
}
