'use client';
import type { Instance } from '@/lib/content';
import { widgetInstance, layoutInstance, structuralInstance } from '@/lib/tree';
import { Icon } from '@/components/ui/Icon';
import { drag } from './dragState';

const TYPE_ICON: Record<string, string> = {
  hero: 'template', richtext: 'edit', cta: 'external', image: 'media',
  testimonial: 'forms', form: 'forms', nav: 'nav', list: 'grid',
};

export function Toolbox({ widgets, shared }: { widgets: any[]; shared: any[] }) {
  const byCat: Record<string, any[]> = {};
  for (const w of widgets) (byCat[w.category] ??= []).push(w);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">Drag a block onto the canvas. Text blocks can be edited directly on the page.</p>

      <Group title="Layout">
        {[1, 2, 3].map((n) => (
          <PaletteItem key={n} label={`${n} column${n > 1 ? 's' : ''}`} icon="grid" create={() => layoutInstance(n)} />
        ))}
      </Group>

      {Object.keys(byCat).sort().map((cat) => (
        <Group key={cat} title={cat}>
          {byCat[cat].map((w) => (
            <PaletteItem
              key={w.id}
              label={w.name}
              icon={TYPE_ICON[w.type] ?? 'template'}
              create={() => (w.type === 'nav' || w.type === 'shared_ref' ? structuralInstance(w.type) : widgetInstance(w))}
            />
          ))}
        </Group>
      ))}

      {shared.length > 0 && (
        <Group title="Shared content">
          {shared.map((s) => (
            <PaletteItem
              key={s.id}
              label={s.key}
              icon="copy"
              create={() => structuralInstance('shared_ref', { sharedContentId: s.id })}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function PaletteItem({ label, icon, create }: { label: string; icon: string; create: () => Instance }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        drag.payload = { mode: 'new', create };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', label);
      }}
      onDragEnd={() => (drag.payload = null)}
      className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm transition hover:border-brand hover:shadow-card active:cursor-grabbing"
    >
      <span className="text-muted">
        <Icon name={icon} size={16} />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}
