import { route, requireUser } from '@/server/http';
import { revokePreviewLink } from '@/server/preview';

export const DELETE = route(async ({ user, params }) => revokePreviewLink(requireUser(user), params.id));
