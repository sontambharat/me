import { route, requireUser, body } from '@/server/http';
import { listComments, addComment } from '@/server/preview';

export const GET = route(async ({ user, params }) => ({
  comments: await listComments(requireUser(user), params.pageId),
}));

export const POST = route(async ({ user, params, req }) => ({
  comment: await addComment(requireUser(user), { ...(await body(req)), pageId: params.pageId }),
}));
