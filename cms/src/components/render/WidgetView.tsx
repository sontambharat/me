'use client';
import { useState } from 'react';
import type { Instance, RenderContext, NavItem } from '@/lib/content';

interface Props {
  inst: Instance;
  ctx?: RenderContext;
  onSubmitForm?: (instanceId: string, formTitle: string, data: Record<string, any>) => Promise<void>;
}

/**
 * Renders a single widget instance with production styling. Shared by the
 * builder canvas, the in-app live preview and the public preview page so they
 * always look identical.
 */
export function WidgetView({ inst, ctx, onSubmitForm }: Props) {
  const p = inst.props ?? {};
  switch (inst.type) {
    case 'hero':
      return (
        <section className="brand-surface px-8 py-16 text-center text-white" style={heroBg(ctx)}>
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight">{p.heading}</h1>
          {p.subheading && <p className="mx-auto mt-3 max-w-xl text-lg text-white/90">{p.subheading}</p>}
          {p.ctaLabel && (
            <a href={p.ctaUrl || '#'} className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900">
              {p.ctaLabel}
            </a>
          )}
        </section>
      );
    case 'richtext':
      return <div className="prose-cms px-8 py-6" dangerouslySetInnerHTML={{ __html: p.html ?? '' }} />;
    case 'cta':
      return (
        <div className="px-8 py-5">
          <a href={p.url || '#'} className="inline-block rounded-lg px-5 py-2.5 font-semibold text-white" style={{ background: accent(ctx) }}>
            {p.label}
          </a>
        </div>
      );
    case 'image':
      return (
        <figure className="px-8 py-4">
          {p.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.src} alt={p.alt || ''} className="w-full rounded-lg" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">No image selected</div>
          )}
          {p.caption && <figcaption className="mt-2 text-sm text-slate-500">{p.caption}</figcaption>}
        </figure>
      );
    case 'testimonial':
      return (
        <blockquote className="mx-8 my-4 rounded-lg border-l-4 bg-slate-50 px-6 py-5" style={{ borderColor: accent(ctx) }}>
          <p className="text-lg italic text-slate-700">“{p.quote}”</p>
          <cite className="mt-2 block text-sm not-italic text-slate-500">
            {p.author}
            {p.role ? `, ${p.role}` : ''}
          </cite>
        </blockquote>
      );
    case 'nav':
      return <NavWidget items={ctx?.nav ?? []} ctx={ctx} />;
    case 'list':
      return <ListWidget title={p.title} limit={p.limit} pages={ctx?.pages ?? []} accent={accent(ctx)} />;
    case 'form':
      return <FormWidget inst={inst} accent={accent(ctx)} onSubmitForm={onSubmitForm} />;
    case 'layout': {
      const cols: Instance[][] = p.cols ?? [];
      return (
        <div className="grid gap-4 px-8 py-4" style={{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(0,1fr))` }}>
          {cols.map((children, i) => (
            <div key={i} className="min-w-0">
              {(children ?? []).map((c) => (
                <WidgetView key={c.instanceId} inst={c} ctx={ctx} onSubmitForm={onSubmitForm} />
              ))}
            </div>
          ))}
        </div>
      );
    }
    case 'shared_ref': {
      const r = inst.resolved;
      if (!r) return <div className="px-8 py-3 text-sm text-red-500">⚠ shared content not found</div>;
      if (r.type === 'richtext')
        return <div className="prose-cms bg-slate-50 px-8 py-4 text-sm" dangerouslySetInnerHTML={{ __html: r.data?.html ?? '' }} />;
      return <pre className="mx-8 my-3 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(r.data, null, 2)}</pre>;
    }
    default:
      return <div className="px-8 py-3 text-sm text-slate-400">[{inst.type}]</div>;
  }
}

function NavWidget({ items, ctx }: { items: NavItem[]; ctx?: RenderContext }) {
  return (
    <nav className="flex items-center justify-between border-b bg-white px-8 py-4">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        {ctx?.theme?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.theme.logoUrl} alt="logo" className="h-7" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-md text-white" style={{ background: accent(ctx) }}>◆</span>
        )}
      </div>
      <ul className="flex items-center gap-6 text-sm font-medium text-slate-600">
        {items.map((it) => (
          <li key={it.id}>
            <a href={it.url} className="hover:text-slate-900">{it.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ListWidget({ title, limit, pages, accent }: { title?: string; limit?: number; pages: RenderContext['pages']; accent: string }) {
  const rows = (pages ?? []).slice(0, limit || 5);
  return (
    <div className="px-8 py-6">
      {title && <h2 className="mb-3 text-xl font-semibold text-slate-900">{title}</h2>}
      <div className="divide-y rounded-lg border">
        {rows.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No items yet.</div>}
        {rows.map((r) => (
          <a key={r.slug} href={`/${r.slug}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
            <span className="font-medium text-slate-800">{r.title}</span>
            <span className="text-xs" style={{ color: accent }}>Read →</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function FormWidget({ inst, accent, onSubmitForm }: { inst: Instance; accent: string; onSubmitForm?: Props['onSubmitForm'] }) {
  const p = inst.props ?? {};
  const fields: any[] = p.fields ?? [];
  const [values, setValues] = useState<Record<string, any>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmitForm) return;
    setBusy(true);
    try {
      await onSubmitForm(inst.instanceId, p.title ?? 'Form', values);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="mx-8 my-4 rounded-lg bg-emerald-50 px-6 py-5 text-emerald-700">{p.successMessage || 'Thanks!'}</div>;

  return (
    <form onSubmit={submit} className="mx-8 my-4 max-w-md rounded-lg border bg-white p-6 shadow-sm">
      {p.title && <h3 className="mb-3 text-lg font-semibold text-slate-900">{p.title}</h3>}
      {fields.map((f) => (
        <div key={f.name} className="mb-3">
          <label className="label">{f.label}{f.required ? ' *' : ''}</label>
          {f.type === 'textarea' ? (
            <textarea className="input" rows={3} required={f.required} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
          ) : (
            <input className="input" type={f.type || 'text'} required={f.required} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
          )}
        </div>
      ))}
      <button type="submit" disabled={busy || !onSubmitForm} className="mt-1 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-60" style={{ background: accent }}>
        {p.submitLabel || 'Submit'}
      </button>
      {!onSubmitForm && <p className="mt-2 text-xs text-slate-400">Form is interactive on the live preview.</p>}
    </form>
  );
}

function accent(ctx?: RenderContext): string {
  return ctx?.theme?.accent || '#4f46e5';
}
function heroBg(ctx?: RenderContext): React.CSSProperties {
  const a = accent(ctx);
  return { background: `linear-gradient(135deg, ${a}, #1e293b)` };
}
