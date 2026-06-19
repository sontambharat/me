import { route, requireUser, body } from '@/server/http';
import { getNavigation, updateNavigation } from '@/server/build';

export const GET = route(async ({ params }) => ({ items: await getNavigation(params.siteId) }));

export const PUT = route(async ({ user, params, req }) => {
  const { items } = await body<{ items: any[] }>(req);
  return { items: await updateNavigation(requireUser(user), params.siteId, items) };
});
