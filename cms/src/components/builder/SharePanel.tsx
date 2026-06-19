'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

export function SharePanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const toast = useToast();
  const [links, setLinks] = useState<any[]>([]);
  const [expiry, setExpiry] = useState('7d');

  async function load() {
    const { links } = await api(`/pages/${pageId}/preview-links`);
    setLinks(links);
  }
  useEffect(() => {
    load();
  }, [pageId]);

  const urlFor = (token: string) => `${location.origin}/preview/${token}`;

  return (
    <Modal title="Share a preview" onClose={onClose} width="max-w-xl">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label">Link expires</label>
          <select className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="1h">1 hour</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="none">Never</option>
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await api(`/pages/${pageId}/preview-links`, { method: 'POST', body: { expiry } });
              toast('Preview link created', 'success');
              load();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          <Icon name="plus" size={15} /> Create link
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {links.length === 0 && <p className="text-sm text-muted">No preview links yet.</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
            <span className={`chip border-transparent ${l.status === 'active' ? 'state-published' : 'state-archived'}`}>{l.status}</span>
            <input readOnly value={urlFor(l.token)} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
            <span className="text-xs text-muted">{l.views} views</span>
            <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(urlFor(l.token)); toast('Copied'); }}>
              <Icon name="copy" size={14} />
            </button>
            <a className="btn btn-sm" href={urlFor(l.token)} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} />
            </a>
            {l.status === 'active' && (
              <button className="btn btn-sm btn-danger" onClick={async () => { await api(`/preview-links/${l.id}`, { method: 'DELETE' }); load(); }}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
