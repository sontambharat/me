import { route, requireUser, body } from '@/server/http';
import { listSharedContent, createSharedContent } from '@/server/build';

export const GET = route(async ({ user, params }) => ({
  items: await listSharedContent(requireUser(user), params.siteId),
}));

export const POST = route(async ({ user, params, req }) => {
  const input = await body<{ global?: boolean; key: string; type?: string; data: any }>(req);
  return { item: await createSharedContent(requireUser(user), { ...input, siteId: input.global ? null : params.siteId }) };
});
