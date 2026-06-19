import { route, requireUser, body } from '@/server/http';
import { listWidgets, createWidget } from '@/server/build';

export const GET = route(async ({ user, params }) => ({
  widgets: await listWidgets(requireUser(user), params.siteId),
}));

export const POST = route(async ({ user, params, req }) => {
  const input = await body<{ global?: boolean; name: string; type: string; schema?: any; category?: string }>(req);
  return { widget: await createWidget(requireUser(user), { ...input, siteId: input.global ? null : params.siteId }) };
});
