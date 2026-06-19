import { NextResponse } from 'next/server';
import { route, requireUser } from '@/server/http';
import { listAssets, uploadAsset } from '@/server/media';

export const GET = route(async ({ user, params }) => ({
  assets: await listAssets(requireUser(user), params.siteId),
}));

export const POST = route(async ({ user, params, req }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const asset = await uploadAsset(requireUser(user), params.siteId, {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: buffer,
  });
  return { asset };
});
