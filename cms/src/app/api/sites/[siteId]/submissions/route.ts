import { route, requireUser } from '@/server/http';
import { listSubmissions } from '@/server/forms';

export const GET = route(async ({ user, params }) => ({
  submissions: await listSubmissions(requireUser(user), params.siteId),
}));
