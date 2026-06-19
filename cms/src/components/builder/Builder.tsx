'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import type { Instance, PageContent, RenderContext, Slots } from '@/lib/content';
import {
  locate,
  container,
  reId,
  widgetInstance,
  layoutInstance,
  structuralInstance,
  type DropTarget,
} from '@/lib/tree';
import { Icon } from '@/components/ui/Icon';
import { StateBadge } from '@/components/ui/StateBadge';
import { useToast } from '@/components/ui/Toast';
import { PageView } from '@/components/render/PageView';
import { Canvas } from './Canvas';
import { Toolbox } from './Toolbox';
import { Properties } from './Properties';
import { SharePanel } from './SharePanel';
import { VersionsPanel } from './VersionsPanel';
import { drag } from './dragState';

const NEXT_STATES: Record<string, string[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['published', 'draft'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

export function Builder({ siteId, pageId }: { siteId: string; pageId: string }) {
  const toast = useToast();
  const [page, setPage] = useState<any>(null);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [shared, setShared] = useState<any[]>([]);
  const [ctx, setCtx] = useState<RenderContext>();
  const [slots, setSlots] = useState<Slots>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rail, setRail] = useState<'insert' | 'props' | 'page'>('insert');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<'share' | 'versions' | null>(null);

  async function loadAll() {
    const [{ page }, { widgets }, { items }, { ctx }] = await Promise.all([
      api(`/pages/${pageId}`),
      api(`/sites/${siteId}/widgets`),
      api(`/sites/${siteId}/shared-content`),
      api(`/sites/${siteId}/context`),
    ]);
    setPage(page);
    setWidgets(widgets);
    setShared(items);
    setCtx(ctx);
    setSlots(structuredClone(page.currentVersion?.content?.slots ?? {}));
    setDirty(false);
  }
  useEffect(() => {
    loadAll();
  }, [pageId]);

  const selected = useMemo(() => (selectedId ? locate(slots, selectedId)?.inst ?? null : null), [slots, selectedId]);

  function mutate(fn: (draft: Slots) => void) {
    setSlots((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  function widgetName(inst: Instance) {
    if (inst.type === 'layout') return `Layout · ${inst.props?.cols?.length ?? 0} col`;
    return widgets.find((w) => w.id === inst.widgetId)?.name ?? cap(inst.type);
  }

  // ---- tree operations ---------------------------------------------------
  function onDrop(target: DropTarget, index: number, payload: typeof drag.payload) {
    if (!payload) return;
    mutate((draft) => {
      const arr = container(draft, target);
      if (!arr) return;
      if (payload.mode === 'new') {
        arr.splice(index, 0, payload.create());
      } else {
        const src = locate(draft, payload.id);
        if (!src) return;
        // Don't drop a layout into its own subtree.
        if (src.inst.type === 'layout' && target.type === 'col' && isInside(src.inst, target.layout)) return;
        let i = index;
        const fromSame = src.array === arr;
        src.array.splice(src.index, 1);
        if (fromSame && src.index < i) i--;
        arr.splice(i, 0, src.inst);
      }
    });
  }

  const updateProps = (id: string, patch: Record<string, any>) =>
    mutate((draft) => {
      const found = locate(draft, id);
      if (found) found.inst.props = { ...found.inst.props, ...patch };
    });
  const remove = (id: string) =>
    mutate((draft) => {
      const f = locate(draft, id);
      if (f) f.array.splice(f.index, 1);
    });
  const duplicate = (id: string) =>
    mutate((draft) => {
      const f = locate(draft, id);
      if (f) f.array.splice(f.index + 1, 0, reId(f.inst));
    });

  async function save() {
    setSaving(true);
    try {
      const { page } = await api(`/pages/${pageId}`, { method: 'PATCH', body: { content: { slots }, note: 'Visual editor' } });
      setPage(page);
      setDirty(false);
      toast('Saved new version', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function transition(state: string) {
    try {
      const { page } = await api(`/pages/${pageId}/transition`, { method: 'POST', body: { state } });
      setPage((p: any) => ({ ...p, state: page.state }));
      toast(`Moved to ${state.replace('_', ' ')}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (!page) return <div className="grid h-screen place-items-center text-muted">Loading builder…</div>;

  const content: PageContent = { slots };
  const previewWidth = device === 'desktop' ? 'max-w-full' : device === 'tablet' ? 'max-w-3xl' : 'max-w-sm';

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href={`/s/${siteId}/pages`} className="btn btn-ghost btn-sm">
          <Icon name="chevron" size={16} className="rotate-180" /> Pages
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{page.title}</span>
          <StateBadge state={page.state} />
          {dirty && <span className="text-xs text-amber-600">● unsaved</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5">
            <button className={`btn-sm rounded-md px-3 ${mode === 'edit' ? 'bg-subtle font-medium' : 'text-muted'}`} onClick={() => setMode('edit')}>
              Edit
            </button>
            <button className={`btn-sm rounded-md px-3 ${mode === 'preview' ? 'bg-subtle font-medium' : 'text-muted'}`} onClick={() => { setMode('preview'); setSelectedId(null); }}>
              Preview
            </button>
          </div>
          <button className="btn btn-sm" onClick={() => setOverlay('versions')}>
            <Icon name="history" size={15} /> Versions
          </button>
          <button className="btn btn-sm" onClick={() => setOverlay('share')}>
            <Icon name="share" size={15} /> Share
          </button>
          {(NEXT_STATES[page.state] ?? []).map((s) => (
            <button key={s} className={`btn btn-sm ${s === 'published' || s === 'approved' ? 'btn-primary' : ''}`} onClick={() => transition(s)}>
              {s === 'in_review' ? 'Submit for review' : cap(s.replace('_', ' '))}
            </button>
          ))}
          <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={save}>
            <Icon name="check" size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'preview' ? (
            <div className="bg-slate-100 p-6">
              {device !== 'desktop' && (
                <div className="mb-3 flex justify-center gap-1">
                  {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                    <button key={d} className={`btn btn-sm ${device === d ? 'btn-primary' : ''}`} onClick={() => setDevice(d)}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <div className={`mx-auto overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200 ${previewWidth}`}>
                <PageView content={content} ctx={ctx} />
              </div>
            </div>
          ) : (
            <Canvas
              slots={slots}
              ctx={ctx}
              selectedId={selectedId}
              widgetName={widgetName}
              onSelect={setSelectedId}
              onUpdateProps={updateProps}
              onDrop={onDrop}
              onDelete={remove}
              onDuplicate={duplicate}
            />
          )}
        </div>

        {/* Right rail */}
        <aside className="flex w-80 flex-col border-l border-line bg-surface">
          {mode === 'preview' ? (
            <div className="p-4">
              <h3 className="mb-2 font-semibold">Preview</h3>
              <p className="mb-3 text-sm text-muted">Viewing the page as it will render. Switch device size:</p>
              <div className="flex gap-1">
                {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                  <button key={d} className={`btn btn-sm ${device === d ? 'btn-primary' : ''}`} onClick={() => setDevice(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex border-b border-line">
                {(['insert', 'props', 'page'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRail(t)}
                    className={`flex-1 py-2.5 text-sm font-medium capitalize ${rail === t ? 'border-b-2 text-ink' : 'text-muted'}`}
                    style={rail === t ? { borderColor: 'rgb(var(--brand))' } : undefined}
                  >
                    {t === 'props' ? 'Properties' : t}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {rail === 'insert' && <Toolbox widgets={widgets} shared={shared} />}
                {rail === 'props' && (
                  <Properties
                    siteId={siteId}
                    inst={selected}
                    widgets={widgets}
                    shared={shared}
                    onUpdateProps={updateProps}
                    onReplaceSelected={(fn) =>
                      mutate((draft) => {
                        if (!selectedId) return;
                        const f = locate(draft, selectedId);
                        if (f) fn(f.inst);
                      })
                    }
                  />
                )}
                {rail === 'page' && <PageMeta page={page} onSaved={loadAll} />}
              </div>
            </>
          )}
        </aside>
      </div>

      {overlay === 'share' && <SharePanel pageId={pageId} onClose={() => setOverlay(null)} />}
      {overlay === 'versions' && <VersionsPanel pageId={pageId} currentVersionId={page.currentVersionId} onClose={() => setOverlay(null)} onRestored={async () => { setOverlay(null); await loadAll(); }} />}
    </div>
  );
}

function PageMeta({ page, onSaved }: { page: any; onSaved: () => void }) {
  const toast = useToast();
  const v = page.currentVersion;
  const [title, setTitle] = useState(v?.title ?? page.title);
  const [slug, setSlug] = useState(v?.slug ?? page.slug);
  const [meta, setMeta] = useState(v?.metadata ?? {});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/pages/${page.id}`, { method: 'PATCH', body: { title, slug, metadata: meta, note: 'Metadata edit' } });
      toast('Page settings saved', 'success');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">Slug</label>
        <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>
      <div>
        <label className="label">SEO title</label>
        <input className="input" value={meta.seoTitle ?? ''} onChange={(e) => setMeta({ ...meta, seoTitle: e.target.value })} />
      </div>
      <div>
        <label className="label">Meta description</label>
        <textarea className="input" rows={3} value={meta.description ?? ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
      </div>
      <button className="btn btn-primary w-full" disabled={busy} onClick={save}>
        Save page settings
      </button>
    </div>
  );
}

function isInside(layout: Instance, targetLayoutId: string): boolean {
  if (layout.instanceId === targetLayoutId) return true;
  for (const col of (layout.props?.cols as Instance[][]) ?? []) {
    for (const child of col) {
      if (child.type === 'layout' && isInside(child, targetLayoutId)) return true;
    }
  }
  return false;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
