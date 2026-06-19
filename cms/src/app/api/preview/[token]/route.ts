import { route } from '@/server/http';
import { resolvePreviewLink } from '@/server/preview';

export const GET = route(async ({ params, req }) => {
  const url = new URL(req.url);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0] || undefined;
  return resolvePreviewLink(params.token, { ip, session: url.searchParams.get('session') ?? undefined });
});
