import { route, requireUser, body } from '@/server/http';
import { listTemplates, createTemplate } from '@/server/build';

export const GET = route(async ({ user, params }) => ({
  templates: await listTemplates(requireUser(user), params.siteId),
}));

export const POST = route(async ({ user, params, req }) => ({
  template: await createTemplate(requireUser(user), { ...(await body(req)), siteId: params.siteId }),
}));
