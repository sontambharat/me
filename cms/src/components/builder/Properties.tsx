'use client';
import { useState } from 'react';
import type { Instance } from '@/lib/content';
import { Icon } from '@/components/ui/Icon';
import { MediaPicker } from '@/components/media/MediaPicker';

interface Props {
  siteId: string;
  inst: Instance | null;
  widgets: any[];
  shared: any[];
  onUpdateProps: (id: string, patch: Record<string, any>) => void;
  onReplaceSelected: (fn: (inst: Instance) => void) => void;
}

export function Properties({ siteId, inst, widgets, shared, onUpdateProps, onReplaceSelected }: Props) {
  const [picking, setPicking] = useState(false);
  if (!inst) return <div className="py-10 text-center text-sm text-muted">Select a block on the canvas to edit its properties.</div>;
  const p = inst.props ?? {};
  const set = (patch: Record<string, any>) => onUpdateProps(inst.instanceId, patch);

  if (['hero', 'richtext', 'cta', 'testimonial'].includes(inst.type)) {
    return (
      <div className="space-y-3">
        <Banner>This block is edited <b>inline</b> — click its text on the canvas to type.</Banner>
        {inst.type === 'hero' && (
          <Field label="Button URL">
            <input className="input" value={p.ctaUrl ?? ''} onChange={(e) => set({ ctaUrl: e.target.value })} />
          </Field>
        )}
        {inst.type === 'cta' && (
          <Field label="Button URL">
            <input className="input" value={p.url ?? ''} onChange={(e) => set({ url: e.target.value })} />
          </Field>
        )}
        {inst.type === 'testimonial' && (
          <Field label="Role / company">
            <input className="input" value={p.role ?? ''} onChange={(e) => set({ role: e.target.value })} />
          </Field>
        )}
      </div>
    );
  }

  if (inst.type === 'image') {
    return (
      <div className="space-y-3">
        <Field label="Image">
          {p.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.src} alt="" className="mb-2 w-full rounded-lg border" />
          ) : (
            <div className="mb-2 grid h-28 place-items-center rounded-lg border border-dashed text-muted">No image</div>
          )}
          <button className="btn w-full" onClick={() => setPicking(true)}>
            <Icon name="media" size={15} /> Choose from library
          </button>
        </Field>
        <Field label="Alt text">
          <input className="input" value={p.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} />
        </Field>
        <Field label="Caption">
          <input className="input" value={p.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} />
        </Field>
        {picking && <MediaPicker siteId={siteId} onClose={() => setPicking(false)} onPick={(a) => { set({ src: a.url, alt: p.alt || a.name }); setPicking(false); }} />}
      </div>
    );
  }

  if (inst.type === 'layout') {
    const cols: Instance[][] = p.cols ?? [];
    return (
      <Field label="Columns">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={`btn btn-sm flex-1 ${cols.length === n ? 'btn-primary' : ''}`}
              onClick={() =>
                onReplaceSelected((it) => {
                  const c = (it.props.cols ?? []) as Instance[][];
                  if (n < c.length) {
                    const extra = c.splice(n).flat();
                    c[n - 1].push(...extra);
                  } else while (c.length < n) c.push([]);
                })
              }
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Reducing columns moves widgets into the last remaining column.</p>
      </Field>
    );
  }

  if (inst.type === 'shared_ref') {
    return (
      <Field label="Shared content fragment">
        <select className="input" value={p.sharedContentId ?? ''} onChange={(e) => set({ sharedContentId: e.target.value })}>
          {shared.map((s) => (
            <option key={s.id} value={s.id}>{s.key}</option>
          ))}
        </select>
      </Field>
    );
  }

  if (inst.type === 'nav') {
    return <Banner>This block renders the site’s navigation menu. Manage items under <b>Navigation</b> in the sidebar.</Banner>;
  }

  if (inst.type === 'list') {
    return (
      <div className="space-y-3">
        <Field label="Title"><input className="input" value={p.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Max items"><input className="input" type="number" value={p.limit ?? 5} onChange={(e) => set({ limit: Number(e.target.value) })} /></Field>
        <Banner>Automatically lists pages from this site.</Banner>
      </div>
    );
  }

  if (inst.type === 'form') {
    return <FormBuilder inst={inst} set={set} />;
  }

  return <Banner>No editable properties for this block.</Banner>;
}

function FormBuilder({ inst, set }: { inst: Instance; set: (patch: Record<string, any>) => void }) {
  const p = inst.props ?? {};
  const fields: any[] = p.fields ?? [];
  const update = (next: any[]) => set({ fields: next });
  return (
    <div className="space-y-3">
      <Field label="Form title"><input className="input" value={p.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Submit button label"><input className="input" value={p.submitLabel ?? ''} onChange={(e) => set({ submitLabel: e.target.value })} /></Field>
      <Field label="Success message"><input className="input" value={p.successMessage ?? ''} onChange={(e) => set({ successMessage: e.target.value })} /></Field>
      <div>
        <label className="label">Fields</label>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <input className="input" placeholder="Label" value={f.label} onChange={(e) => update(fields.map((x, j) => (j === i ? { ...x, label: e.target.value, name: slug(e.target.value) } : x)))} />
                <button className="btn btn-sm btn-danger" onClick={() => update(fields.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <select className="input" value={f.type} onChange={(e) => update(fields.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                  {['text', 'email', 'tel', 'textarea'].map((t) => <option key={t}>{t}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => update(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> required
                </label>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-sm mt-2 w-full" onClick={() => update([...fields, { name: `field_${fields.length + 1}`, label: 'New field', type: 'text', required: false }])}>
          <Icon name="plus" size={14} /> Add field
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-subtle px-3 py-2 text-xs text-slate-600">{children}</div>;
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
}
