import { route, requireUser, body } from '@/server/http';
import { listPreviewLinks, createPreviewLink } from '@/server/preview';

export const GET = route(async ({ user, params }) => ({
  links: await listPreviewLinks(requireUser(user), params.pageId),
}));

export const POST = route(async ({ user, params, req }) => ({
  link: await createPreviewLink(requireUser(user), { ...(await body(req)), pageId: params.pageId }),
}));
