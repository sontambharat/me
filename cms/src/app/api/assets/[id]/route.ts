import { route, requireUser } from '@/server/http';
import { deleteAsset } from '@/server/media';

export const DELETE = route(async ({ user, params }) => deleteAsset(requireUser(user), params.id));
