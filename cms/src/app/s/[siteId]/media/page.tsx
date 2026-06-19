'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, upload } from '@/lib/apiClient';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

// Azure Blob Storage in production; local disk in the sandbox.
const storageNote = 'Stored in Azure Blob Storage (local disk fallback in dev).';

export default function MediaPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const toast = useToast();
  const [assets, setAssets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { assets } = await api(`/sites/${siteId}/assets`);
    setAssets(assets);
  }
  useEffect(() => {
    load();
  }, [siteId]);

  async function doUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await upload(`/sites/${siteId}/assets`, f);
      toast(`Uploaded ${files.length} file(s)`, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
          <p className="mt-1 text-sm text-muted">Upload and manage images. {storageNote}</p>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => doUpload(e.target.files)} />
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); doUpload(e.dataTransfer.files); }}
        className={`mb-6 rounded-xl2 border-2 border-dashed p-8 text-center transition ${dragOver ? 'border-brand bg-brand/5' : 'border-line'}`}
      >
        <Icon name="upload" size={24} className="mx-auto text-muted" />
        <p className="mt-2 text-sm text-muted">Drag & drop images here, or use the Upload button.</p>
      </div>

      {assets.length === 0 ? (
        <div className="card py-16 text-center text-muted">No media yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="card group overflow-hidden">
              <div className="relative aspect-square bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                <button
                  className="absolute right-2 top-2 hidden rounded-md bg-white/90 p-1.5 text-red-600 shadow group-hover:block"
                  onClick={async () => { await api(`/assets/${a.id}`, { method: 'DELETE' }); toast('Deleted'); load(); }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="px-3 py-2">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="text-xs text-muted">{(a.size / 1024).toFixed(0)} KB</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
