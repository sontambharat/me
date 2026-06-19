import { route, requireUser } from '@/server/http';
import { listVersions } from '@/server/build';

export const GET = route(async ({ user, params }) => ({
  versions: await listVersions(requireUser(user), params.pageId),
}));
