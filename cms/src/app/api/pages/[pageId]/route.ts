import { route, requireUser, body } from '@/server/http';
import { getPage, updatePage } from '@/server/build';

export const GET = route(async ({ user, params }) => ({ page: await getPage(requireUser(user), params.pageId) }));

export const PATCH = route(async ({ user, params, req }) => ({
  page: await updatePage(requireUser(user), params.pageId, await body(req)),
}));
