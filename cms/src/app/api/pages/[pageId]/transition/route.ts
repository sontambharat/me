import { route, requireUser, body } from '@/server/http';
import { transitionPage } from '@/server/build';

export const POST = route(async ({ user, params, req }) => {
  const { state, reason } = await body<{ state: string; reason?: string }>(req);
  return { page: await transitionPage(requireUser(user), params.pageId, state, reason) };
});
