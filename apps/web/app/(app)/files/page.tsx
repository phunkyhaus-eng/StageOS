'use client';

import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/ui/panel';
import { apiFetch } from '@/lib/api-client';
import { useFiles } from '@/lib/hooks/use-stageos-data';
import { useAppStore } from '@/lib/state/app-store';

export default function FilesPage() {
  const files = useFiles();
  const queryClient = useQueryClient();
  const token = useAppStore((s) => s.accessToken);
  const bandId = useAppStore((s) => s.activeBandId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !bandId) return;

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const presign = await apiFetch<{
        uploadUrl: string;
        headers: Record<string, string>;
      }>('/files/presign-upload', {
        method: 'POST',
        token,
        body: {
          bandId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size
        }
      });

      const upload = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.headers,
        body: file
      });

      if (!upload.ok) {
        throw new Error(`Upload failed (${upload.status})`);
      }

      await queryClient.invalidateQueries({ queryKey: ['files', bandId] });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel title="Upload to File Hub" subtitle="S3-backed, versioned, role-restricted assets">
        <form className="space-y-3" onSubmit={onUpload}>
          <input
            name="file"
            type="file"
            className="block h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-lg bg-cyan-500 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
          >
            {busy ? 'Uploading...' : 'Upload File'}
          </button>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </form>
      </Panel>

      <Panel title="File Inventory" subtitle="Per-event grouping, offline markers, and signed retrieval">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(files.data ?? []).map((file) => (
            <article key={String(file.id)} className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3">
              <p className="truncate text-sm font-medium text-slate-100">{String(file.fileName)}</p>
              <p className="mt-1 text-xs text-slate-400">{(Number(file.sizeBytes) / 1024).toFixed(1)} KB</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
                  v{String(file.version)}
                </span>
                <span className={`rounded-full px-2 py-0.5 ${file.availableOffline ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                  {file.availableOffline ? 'Prefetched' : 'Cloud'}
                </span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
