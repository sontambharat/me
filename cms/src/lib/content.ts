// Shared content model used by the page builder, the live preview and the
// public preview page.

export interface Instance {
  instanceId: string;
  type: string; // hero | richtext | cta | image | testimonial | form | nav | list | layout | shared_ref
  widgetId?: string;
  props: Record<string, any>;
  resolved?: any; // populated server-side for shared_ref
}

export type Slots = Record<string, Instance[]>;
export interface PageContent {
  slots: Slots;
}

export interface SiteTheme {
  accent?: string;
  accentFg?: string;
  font?: string;
  logoUrl?: string;
  pageBg?: string;
  radius?: number;
}

export interface NavItem {
  id: string;
  label: string;
  url: string;
  children?: NavItem[];
}

export interface RenderContext {
  theme?: SiteTheme;
  nav?: NavItem[];
  pages?: { title: string; slug: string; state: string; updatedAt?: string }[];
  preview?: boolean;
}

export const SLOT_ORDER = ['header', 'hero', 'body', 'sidebar', 'footer'];

export function orderedSlots(slots: Slots): string[] {
  const known = SLOT_ORDER.filter((s) => s in slots);
  const rest = Object.keys(slots).filter((s) => !known.includes(s));
  return [...known, ...rest];
}

/** Visit every instance in a content tree, recursing into layout columns. */
export function walkInstances(slots: Slots, fn: (inst: Instance) => void): void {
  const visit = (inst: Instance) => {
    fn(inst);
    if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
      for (const col of inst.props.cols as Instance[][]) for (const child of col ?? []) visit(child);
    }
  };
  for (const arr of Object.values(slots)) for (const inst of arr) visit(inst);
}

export function emptyContentForSlots(slotNames: string[]): PageContent {
  return { slots: Object.fromEntries(slotNames.map((s) => [s, []])) };
}
