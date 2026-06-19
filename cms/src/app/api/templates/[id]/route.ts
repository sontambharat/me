import { route, requireUser, body } from '@/server/http';
import { updateTemplate } from '@/server/build';

export const PATCH = route(async ({ user, params, req }) => ({
  template: await updateTemplate(requireUser(user), params.id, await body(req)),
}));
