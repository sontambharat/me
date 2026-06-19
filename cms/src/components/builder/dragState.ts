import type { Instance } from '@/lib/content';

// Module-level drag payload shared between the Toolbox (source of new widgets)
// and the Canvas (drop target). dataTransfer can't carry functions and isn't
// readable during dragover, so we keep the payload here.
export const drag: {
  payload: { mode: 'new'; create: () => Instance } | { mode: 'move'; id: string } | null;
} = { payload: null };
