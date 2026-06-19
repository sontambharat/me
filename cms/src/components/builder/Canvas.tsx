'use client';
import { useRef, useState, createElement } from 'react';
import type { Instance, Slots, RenderContext } from '@/lib/content';
import { orderedSlots } from '@/lib/content';
import type { DropTarget } from '@/lib/tree';
import { WidgetView } from '@/components/render/WidgetView';
import { Icon } from '@/components/ui/Icon';
import { drag } from './dragState';

interface CanvasProps {
  slots: Slots;
  ctx?: RenderContext;
  selectedId: string | null;
  widgetName: (inst: Instance) => string;
  onSelect: (id: string | null) => void;
  onUpdateProps: (id: string, patch: Record<string, any>) => void;
  onDrop: (target: DropTarget, index: number, payload: typeof drag.payload) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function Canvas(props: CanvasProps) {
  const { slots } = props;
  return (
    <div className="min-h-full bg-slate-100 p-6" onClick={() => props.onSelect(null)}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200">
        {orderedSlots(slots).map((slot) => (
          <div key={slot}>
            <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{slot}</div>
            <DropZone target={{ type: 'slot', slot }} items={slots[slot] ?? []} {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DropZone({ target, items, ...props }: { target: DropTarget; items: Instance[] } & CanvasProps) {
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function indexFromY(y: number): number {
    const kids = Array.from(ref.current?.querySelectorAll(':scope > [data-cw]') ?? []) as HTMLElement[];
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return kids.length;
  }

  return (
    <div
      ref={ref}
      className={`relative min-h-[44px] ${items.length === 0 ? 'm-2 rounded-lg border-2 border-dashed border-slate-200' : ''}`}
      onDragOver={(e) => {
        if (!drag.payload) return;
        e.preventDefault();
        e.stopPropagation();
        setOverIndex(indexFromY(e.clientY));
      }}
      onDragLeave={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOverIndex(null);
      }}
      onDrop={(e) => {
        if (!drag.payload) return;
        e.preventDefault();
        e.stopPropagation();
        const index = indexFromY(e.clientY);
        const payload = drag.payload;
        drag.payload = null;
        setOverIndex(null);
        props.onDrop(target, index, payload);
      }}
    >
      {items.length === 0 && overIndex === null && (
        <div className="py-4 text-center text-xs text-slate-400">Drag widgets here</div>
      )}
      {items.map((inst, i) => (
        <div key={inst.instanceId}>
          {overIndex === i && <Indicator />}
          <CanvasInstance inst={inst} {...props} />
        </div>
      ))}
      {overIndex === items.length && <Indicator />}
    </div>
  );
}

function Indicator() {
  return <div className="mx-3 my-1 h-1 rounded bg-brand" style={{ background: 'rgb(var(--brand))' }} />;
}

function CanvasInstance({ inst, ...props }: { inst: Instance } & CanvasProps) {
  const selected = props.selectedId === inst.instanceId;
  const isText = ['hero', 'richtext', 'cta', 'testimonial'].includes(inst.type);

  return (
    <div
      data-cw
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect(inst.instanceId);
      }}
      className={`group relative ${selected ? 'z-10 ring-2 ring-brand' : 'hover:ring-1 hover:ring-slate-300'}`}
    >
      {/* Hover/selection toolbar */}
      <div className={`absolute -top-3 right-2 z-20 flex items-center gap-0.5 rounded-md border border-line bg-white px-1 py-0.5 shadow-card ${selected ? 'flex' : 'hidden group-hover:flex'}`}>
        <span
          draggable
          onDragStart={(e) => {
            drag.payload = { mode: 'move', id: inst.instanceId };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', inst.instanceId);
          }}
          onDragEnd={() => (drag.payload = null)}
          className="cursor-grab px-1 text-slate-400 hover:text-slate-700"
          title="Drag to move"
        >
          <Icon name="drag" size={14} />
        </span>
        <span className="px-1 text-[10px] font-medium text-slate-400">{props.widgetName(inst)}</span>
        <button className="px-1 text-slate-400 hover:text-slate-700" title="Duplicate" onClick={(e) => { e.stopPropagation(); props.onDuplicate(inst.instanceId); }}>
          <Icon name="copy" size={13} />
        </button>
        <button className="px-1 text-slate-400 hover:text-red-600" title="Delete" onClick={(e) => { e.stopPropagation(); props.onDelete(inst.instanceId); }}>
          <Icon name="trash" size={13} />
        </button>
      </div>

      {isText ? <InlineEditable inst={inst} ctx={props.ctx} onUpdateProps={props.onUpdateProps} /> : inst.type === 'layout' ? (
        <LayoutEditable inst={inst} {...props} />
      ) : (
        <WidgetView inst={inst} ctx={props.ctx} />
      )}
    </div>
  );
}

function LayoutEditable({ inst, ...props }: { inst: Instance } & CanvasProps) {
  const cols: Instance[][] = inst.props?.cols ?? [];
  return (
    <div className="grid gap-2 bg-slate-50 p-2" style={{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(0,1fr))` }}>
      {cols.map((children, ci) => (
        <div key={ci} className="rounded border border-dashed border-slate-200 bg-white">
          <DropZone target={{ type: 'col', layout: inst.instanceId, col: ci }} items={children ?? []} {...props} />
        </div>
      ))}
    </div>
  );
}

/** Inline (on-canvas) editing for text widgets. */
function InlineEditable({ inst, ctx, onUpdateProps }: { inst: Instance; ctx?: RenderContext; onUpdateProps: (id: string, p: Record<string, any>) => void }) {
  const p = inst.props ?? {};
  const accent = ctx?.theme?.accent || '#4f46e5';
  const commit = (field: string, value: string) => onUpdateProps(inst.instanceId, { [field]: value });

  if (inst.type === 'hero') {
    return (
      <section className="px-8 py-16 text-center text-white" style={{ background: `linear-gradient(135deg, ${accent}, #1e293b)` }}>
        <Text as="h1" className="mx-auto max-w-2xl text-4xl font-bold outline-none" value={p.heading} onCommit={(v) => commit('heading', v)} />
        <Text as="p" className="mx-auto mt-3 max-w-xl text-lg text-white/90 outline-none" value={p.subheading} onCommit={(v) => commit('subheading', v)} />
        {p.ctaLabel !== undefined && (
          <span className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900">
            <Text as="span" className="outline-none" value={p.ctaLabel} onCommit={(v) => commit('ctaLabel', v)} />
          </span>
        )}
      </section>
    );
  }
  if (inst.type === 'cta') {
    return (
      <div className="px-8 py-5">
        <span className="inline-block rounded-lg px-5 py-2.5 font-semibold text-white" style={{ background: accent }}>
          <Text as="span" className="outline-none" value={p.label} onCommit={(v) => commit('label', v)} />
        </span>
      </div>
    );
  }
  if (inst.type === 'testimonial') {
    return (
      <blockquote className="mx-8 my-4 rounded-lg border-l-4 bg-slate-50 px-6 py-5" style={{ borderColor: accent }}>
        <Text as="p" className="text-lg italic text-slate-700 outline-none" value={p.quote} onCommit={(v) => commit('quote', v)} />
        <Text as="cite" className="mt-2 block text-sm not-italic text-slate-500 outline-none" value={p.author} onCommit={(v) => commit('author', v)} />
      </blockquote>
    );
  }
  // richtext
  return <RichText html={p.html ?? ''} onCommit={(html) => commit('html', html)} />;
}

function Text({ as, value, onCommit, className }: { as: string; value?: string; onCommit: (v: string) => void; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  return createElement(as, {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    className,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onBlur: () => onCommit(ref.current?.innerText ?? ''),
    dangerouslySetInnerHTML: { __html: escapeHtml(value ?? '') },
  } as any);
}

function RichText({ html, onCommit }: { html: string; onCommit: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cmd = (c: string, val?: string) => {
    document.execCommand(c, false, val);
    ref.current?.focus();
  };
  return (
    <div className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex gap-1 rounded-md border border-line bg-white p-1 text-xs shadow-sm">
        <button className="rounded px-2 py-1 font-bold hover:bg-subtle" onMouseDown={(e) => { e.preventDefault(); cmd('bold'); }}>B</button>
        <button className="rounded px-2 py-1 italic hover:bg-subtle" onMouseDown={(e) => { e.preventDefault(); cmd('italic'); }}>I</button>
        <button className="rounded px-2 py-1 hover:bg-subtle" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'h2'); }}>H2</button>
        <button className="rounded px-2 py-1 hover:bg-subtle" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'p'); }}>P</button>
        <button className="rounded px-2 py-1 hover:bg-subtle" onMouseDown={(e) => { e.preventDefault(); const url = prompt('Link URL'); if (url) cmd('createLink', url); }}>Link</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="prose-cms min-h-[2rem] outline-none"
        onBlur={() => onCommit(ref.current?.innerHTML ?? '')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
