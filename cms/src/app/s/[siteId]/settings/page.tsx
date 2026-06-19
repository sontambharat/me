'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/apiClient';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { SiteTheme } from '@/lib/content';

const PRESET_COLORS = ['#4f46e5', '#0d9488', '#db2777', '#ea580c', '#2563eb', '#7c3aed', '#16a34a', '#0f172a'];

export default function SettingsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = useState<SiteTheme>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [{ site }, { templates }] = await Promise.all([api(`/sites/${siteId}`), api(`/sites/${siteId}/templates`)]);
    setTheme(site.theme ?? {});
    setTemplates(templates);
  }
  useEffect(() => {
    load();
  }, [siteId]);

  async function saveTheme() {
    try {
      await api(`/sites/${siteId}/theme`, { method: 'PUT', body: theme });
      toast('Theme saved', 'success');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Templates & Theme</h1>
        <p className="mt-1 text-sm text-muted">Brand this site and manage reusable page templates.</p>
      </header>

      <section className="card mb-6 p-6">
        <h2 className="mb-4 font-semibold">Theme</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="label">Brand color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTheme((t) => ({ ...t, accent: c }))}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition ${theme.accent === c ? 'ring-slate-400' : 'ring-transparent'}`}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={theme.accent ?? '#4f46e5'} onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))} className="h-8 w-8 cursor-pointer rounded border" />
            </div>

            <label className="label mt-4">Page background</label>
            <input className="input" value={theme.pageBg ?? '#ffffff'} onChange={(e) => setTheme((t) => ({ ...t, pageBg: e.target.value }))} />

            <label className="label mt-4">Logo URL (optional)</label>
            <input className="input" value={theme.logoUrl ?? ''} onChange={(e) => setTheme((t) => ({ ...t, logoUrl: e.target.value }))} placeholder="https://…" />
          </div>

          {/* Live theme preview */}
          <div>
            <label className="label">Preview</label>
            <div className="overflow-hidden rounded-xl border" style={{ background: theme.pageBg ?? '#fff' }}>
              <div className="px-5 py-8 text-center text-white" style={{ background: `linear-gradient(135deg, ${theme.accent ?? '#4f46e5'}, #1e293b)` }}>
                <div className="text-lg font-bold">Your headline</div>
                <div className="mt-1 text-sm text-white/80">Supporting copy goes here.</div>
              </div>
              <div className="p-5">
                <button className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: theme.accent ?? '#4f46e5' }}>
                  Primary button
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <button className="btn btn-primary" onClick={saveTheme}>
            <Icon name="check" size={16} /> Save theme
          </button>
        </div>
      </section>

      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Templates</h2>
          <button className="btn btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New template
          </button>
        </div>
        <div className="divide-y divide-line">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-3">
              <Icon name="template" size={18} className="text-muted" />
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted">Slots: {t.slots.join(' · ')}</div>
              </div>
              <span className="chip">v{t.version}</span>
            </div>
          ))}
          {templates.length === 0 && <p className="py-4 text-sm text-muted">No templates yet.</p>}
        </div>
      </section>

      {creating && (
        <NewTemplateModal
          onClose={() => setCreating(false)}
          onCreate={async (name, slots) => {
            try {
              await api(`/sites/${siteId}/templates`, { method: 'POST', body: { name, slots } });
              toast('Template created', 'success');
              setCreating(false);
              load();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        />
      )}
    </div>
  );
}

function NewTemplateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, slots: string[]) => void }) {
  const [name, setName] = useState('');
  const ALL = ['header', 'hero', 'body', 'sidebar', 'footer'];
  const [slots, setSlots] = useState<string[]>(['header', 'hero', 'body', 'footer']);
  return (
    <Modal title="New template" onClose={onClose}>
      <label className="label">Template name</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product Page" autoFocus />
      <label className="label mt-4">Slot regions</label>
      <div className="flex flex-wrap gap-2">
        {ALL.map((s) => {
          const on = slots.includes(s);
          return (
            <button
              key={s}
              onClick={() => setSlots((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
              className={`chip capitalize ${on ? 'border-transparent text-white' : ''}`}
              style={on ? { background: 'rgb(var(--brand))' } : undefined}
            >
              {s}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!name || slots.length === 0} onClick={() => onCreate(name, slots)}>
          Create template
        </button>
      </div>
    </Modal>
  );
}
