'use client';
import type { PageContent, RenderContext } from '@/lib/content';
import { orderedSlots } from '@/lib/content';
import { WidgetView } from './WidgetView';

export function PageView({
  content,
  ctx,
  onSubmitForm,
}: {
  content: PageContent;
  ctx?: RenderContext;
  onSubmitForm?: (instanceId: string, formTitle: string, data: Record<string, any>) => Promise<void>;
}) {
  const slots = content?.slots ?? {};
  return (
    <div style={{ background: ctx?.theme?.pageBg || '#ffffff' }} className="min-h-full text-slate-900">
      {orderedSlots(slots).map((slot) => (
        <div key={slot} data-slot={slot}>
          {(slots[slot] ?? []).map((inst) => (
            <WidgetView key={inst.instanceId} inst={inst} ctx={ctx} onSubmitForm={onSubmitForm} />
          ))}
        </div>
      ))}
    </div>
  );
}
