import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listSites } from '@/server/build';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const sites = await listSites(user);
  if (sites.length === 0) redirect('/login');
  redirect(`/s/${sites[0].id}/pages`);
}
