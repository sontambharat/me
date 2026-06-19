import { route, body } from '@/server/http';
import { addComment } from '@/server/preview';

export const POST = route(async ({ params, req }) => {
  const input = await body<{ name: string; body: string; pin?: any; pageId: string }>(req);
  return {
    comment: await addComment(
      { guest: true, name: input.name, linkToken: params.token },
      { pageId: input.pageId, body: input.body, pin: input.pin },
    ),
  };
});
