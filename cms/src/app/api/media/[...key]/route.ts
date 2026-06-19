import { NextResponse } from 'next/server';
import { getBlob } from '@/lib/storage';

// Serves media from Azure Blob (prod) or local disk (sandbox).
export async function GET(_req: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const blob = await getBlob(key.join('/'));
  if (!blob) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(blob.data as any, {
    headers: { 'content-type': blob.contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
