'use client';
import { useParams } from 'next/navigation';
import { Builder } from '@/components/builder/Builder';

export default function EditorPage() {
  const { siteId, pageId } = useParams<{ siteId: string; pageId: string }>();
  return <Builder siteId={siteId} pageId={pageId} />;
}
