'use client';
import { useEffect, useRef, useState } from 'react';
import { api, upload } from '@/lib/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

export interface Asset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function MediaPicker({ siteId, onClose, onPick }: { siteId: string; onClose: () => void; onPick: (asset: Asset) => void }) {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
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
      for (const file of Array.from(files)) {
        await upload(`/sites/${siteId}/assets`, file);
      }
      toast('Uploaded', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Media Library" onClose={onClose} width="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Pick an image or upload a new one.</p>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={15} /> {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => doUpload(e.target.files)} />
      </div>
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted">
          <Icon name="media" size={28} />
          <p className="mt-2 text-sm">No media yet. Upload your first image.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {assets.map((a) => (
            <button
              key={a.id}
              onClick={() => onPick(a)}
              className="group overflow-hidden rounded-lg border text-left transition hover:border-brand hover:ring-2 hover:ring-brand/30"
            >
              <div className="aspect-square bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
              </div>
              <div className="truncate px-2 py-1.5 text-xs">{a.name}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
