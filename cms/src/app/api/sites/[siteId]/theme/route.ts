import { route, requireUser, body } from '@/server/http';
import { updateSiteTheme } from '@/server/build';

export const PUT = route(async ({ user, params, req }) => ({
  site: await updateSiteTheme(requireUser(user), params.siteId, await body(req)),
}));
