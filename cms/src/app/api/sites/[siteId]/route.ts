import { route, requireUser } from '@/server/http';
import { getSite } from '@/server/build';

export const GET = route(async ({ user, params }) => ({ site: await getSite(requireUser(user), params.siteId) }));
