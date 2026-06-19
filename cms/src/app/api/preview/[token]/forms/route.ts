import { route, body } from '@/server/http';
import { resolvePreviewLink } from '@/server/preview';
import { submitForm } from '@/server/forms';

export const POST = route(async ({ params, req }) => {
  const input = await body<{ instanceId: string; formTitle?: string; data: Record<string, any> }>(req);
  // Validate the token resolves (active link) and get the page/site context.
  const resolved = await resolvePreviewLink(params.token);
  const submission = await submitForm({
    siteId: resolved.page!.siteId,
    pageId: resolved.page!.id,
    instanceId: input.instanceId,
    formTitle: input.formTitle,
    data: input.data,
  });
  return { ok: true, id: submission.id };
});
