import { route, requireUser } from '@/server/http';
import { buildRenderContext } from '@/server/build';

// Theme + navigation + page list used to render nav/list widgets in the builder.
export const GET = route(async ({ user, params }) => {
  requireUser(user);
  return { ctx: await buildRenderContext(params.siteId, true) };
});
