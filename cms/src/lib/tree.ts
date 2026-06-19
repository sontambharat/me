import type { Instance, Slots } from './content';

export const newInstanceId = () => `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export interface Located {
  array: Instance[];
  index: number;
  inst: Instance;
}

/** Find an instance and its parent array anywhere in the tree. */
export function locate(slots: Slots, id: string): Located | null {
  const search = (arr: Instance[]): Located | null => {
    for (let i = 0; i < arr.length; i++) {
      const inst = arr[i];
      if (inst.instanceId === id) return { array: arr, index: i, inst };
      if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
        for (const col of inst.props.cols as Instance[][]) {
          const found = search(col);
          if (found) return found;
        }
      }
    }
    return null;
  };
  for (const arr of Object.values(slots)) {
    const found = search(arr);
    if (found) return found;
  }
  return null;
}

/** Resolve a drop-target container array (a slot or a layout column). */
export function container(slots: Slots, desc: DropTarget): Instance[] | null {
  if (desc.type === 'slot') return slots[desc.slot] ?? null;
  const layout = locate(slots, desc.layout);
  return (layout?.inst.props?.cols?.[desc.col] as Instance[]) ?? null;
}

export type DropTarget = { type: 'slot'; slot: string } | { type: 'col'; layout: string; col: number };

export function reId(inst: Instance): Instance {
  const copy: Instance = { ...structuredClone(inst), instanceId: newInstanceId() };
  if (copy.type === 'layout' && Array.isArray(copy.props?.cols)) {
    copy.props.cols = (copy.props.cols as Instance[][]).map((col) => col.map(reId));
  }
  return copy;
}

// ---- factories -----------------------------------------------------------
export function widgetInstance(w: { id: string; type: string; schema: Record<string, any> }): Instance {
  const props: Record<string, any> = {};
  for (const [field, def] of Object.entries(w.schema ?? {})) props[field] = (def as any).default ?? defaultForType((def as any).type);
  // Sensible starter content per type so the canvas isn't blank.
  Object.assign(props, STARTERS[w.type] ?? {});
  return { instanceId: newInstanceId(), widgetId: w.id, type: w.type, props };
}

export function structuralInstance(type: string, props: Record<string, any> = {}): Instance {
  return { instanceId: newInstanceId(), type, props };
}

export function layoutInstance(cols: number): Instance {
  return { instanceId: newInstanceId(), type: 'layout', props: { cols: Array.from({ length: cols }, () => []) } };
}

function defaultForType(t?: string) {
  if (t === 'number') return 0;
  if (t === 'array') return [];
  return '';
}

const STARTERS: Record<string, Record<string, any>> = {
  hero: { heading: 'Your headline here', subheading: 'A short supporting sentence.', ctaLabel: 'Learn more', ctaUrl: '#' },
  richtext: { html: '<p>Start writing…</p>' },
  cta: { label: 'Get started', url: '#' },
  testimonial: { quote: 'Add a customer quote here.', author: 'Customer name', role: 'Title' },
  form: { title: 'Contact us', submitLabel: 'Send', successMessage: 'Thanks!', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }] },
  list: { title: 'Latest', limit: 5 },
};
