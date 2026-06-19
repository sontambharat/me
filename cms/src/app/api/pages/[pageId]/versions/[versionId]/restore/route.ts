import { route, requireUser } from '@/server/http';
import { restoreVersion } from '@/server/build';

export const POST = route(async ({ user, params }) => ({
  page: await restoreVersion(requireUser(user), params.pageId, params.versionId),
}));
