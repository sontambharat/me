import { route, requireUser, body } from '@/server/http';
import { listSites, createSite } from '@/server/build';

export const GET = route(async ({ user }) => ({ sites: await listSites(requireUser(user)) }));

export const POST = route(async ({ user, req }) => ({
  site: await createSite(requireUser(user), await body(req)),
}));
