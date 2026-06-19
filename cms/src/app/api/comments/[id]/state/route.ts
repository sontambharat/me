import { route, requireUser, body } from '@/server/http';
import { setCommentState } from '@/server/preview';

export const PATCH = route(async ({ user, params, req }) => {
  const { state } = await body<{ state: string }>(req);
  return { comment: await setCommentState(requireUser(user), params.id, state) };
});
