'use client';

import { FormEvent, useState } from 'react';
import { fetchMe, login } from '@/lib/api-client';
import { useAppStore } from '@/lib/state/app-store';

export function LoginCard() {
  const [email, setEmail] = useState('owner@stageos.local');
  const [password, setPassword] = useState('Passw0rd!');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = useAppStore((s) => s.accessToken);
  const user = useAppStore((s) => s.user);
  const setAccessToken = useAppStore((s) => s.setAccessToken);
  const setUser = useAppStore((s) => s.setUser);
  const signOut = useAppStore((s) => s.signOut);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const auth = await login(email, password, totpCode || undefined);
      setAccessToken(auth.accessToken);
      const me = await fetchMe(auth.accessToken);
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  if (token && user) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-200">
        <p className="font-semibold text-cyan-200">{user.name}</p>
        <p className="mt-1 text-slate-400">{user.email}</p>
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-slate-600 px-2 py-1.5 text-left text-slate-200 transition hover:border-rose-400/50 hover:text-rose-200"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Session</p>
      <div className="mt-3 space-y-2">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          placeholder="Email"
          type="email"
          required
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          placeholder="Password"
          type="password"
          required
        />
        <input
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          placeholder="2FA Code (if enabled)"
          type="text"
        />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
      >
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
