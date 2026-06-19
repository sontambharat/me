import { route, requireUser, body } from '@/server/http';
import { listPages, createPage } from '@/server/build';

export const GET = route(async ({ user, params }) => ({
  pages: await listPages(requireUser(user), params.siteId),
}));

export const POST = route(async ({ user, params, req }) => ({
  page: await createPage(requireUser(user), { ...(await body(req)), siteId: params.siteId }),
}));
