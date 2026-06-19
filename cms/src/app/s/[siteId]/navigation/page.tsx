'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/apiClient';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { NavItem } from '@/lib/content';

const nid = () => `n_${Math.random().toString(36).slice(2, 8)}`;

export default function NavigationPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const toast = useToast();
  const [items, setItems] = useState<NavItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/sites/${siteId}/nav`).then(({ items }) => setItems(items));
  }, [siteId]);

  async function save() {
    setBusy(true);
    try {
      await api(`/sites/${siteId}/nav`, { method: 'PUT', body: { items } });
      toast('Navigation saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const update = (id: string, patch: Partial<NavItem>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : { ...it, children: it.children?.map((c) => (c.id === id ? { ...c, ...patch } : c)) })));
  const remove = (id: string) =>
    setItems((arr) => arr.filter((it) => it.id !== id).map((it) => ({ ...it, children: it.children?.filter((c) => c.id !== id) })));

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Navigation</h1>
          <p className="mt-1 text-sm text-muted">Manage the menu rendered by the Navigation widget.</p>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          <Icon name="check" size={16} /> Save menu
        </button>
      </header>

      <div className="card divide-y divide-line">
        {items.length === 0 && <div className="p-6 text-center text-muted">No menu items yet.</div>}
        {items.map((it) => (
          <div key={it.id} className="p-3">
            <Row item={it} onChange={(p) => update(it.id, p)} onRemove={() => remove(it.id)} />
            <div className="ml-6 mt-2 space-y-2 border-l border-dashed pl-3">
              {(it.children ?? []).map((c) => (
                <Row key={c.id} item={c} child onChange={(p) => update(c.id, p)} onRemove={() => remove(c.id)} />
              ))}
              <button
                className="btn btn-sm btn-ghost text-muted"
                onClick={() => setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, children: [...(x.children ?? []), { id: nid(), label: 'New item', url: '/' }] } : x)))}
              >
                <Icon name="plus" size={14} /> Sub-item
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn mt-4" onClick={() => setItems((arr) => [...arr, { id: nid(), label: 'New item', url: '/' }])}>
        <Icon name="plus" size={15} /> Add menu item
      </button>
    </div>
  );
}

function Row({ item, child, onChange, onRemove }: { item: NavItem; child?: boolean; onChange: (p: Partial<NavItem>) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name="drag" size={14} className="text-slate-300" />
      <input className="input flex-1" value={item.label} placeholder="Label" onChange={(e) => onChange({ label: e.target.value })} />
      <input className="input flex-1" value={item.url} placeholder="/url" onChange={(e) => onChange({ url: e.target.value })} />
      <button className="btn btn-sm btn-danger" onClick={onRemove}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
