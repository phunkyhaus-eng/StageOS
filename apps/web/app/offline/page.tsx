export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center text-slate-100">
      <h1 className="text-3xl font-semibold">You are offline</h1>
      <p className="mt-3 text-slate-300">
        StageOS is running in offline mode. Local changes are queued and will sync once your connection returns.
      </p>
      <a href="/dashboard" className="mt-6 rounded-lg border border-cyan-300/50 px-4 py-2 text-cyan-100">
        Return to Dashboard
      </a>
    </main>
  );
}
