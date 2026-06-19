import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listSites } from '@/server/build';
import { AppShell } from '@/components/shell/AppShell';
import { ToastProvider } from '@/components/ui/Toast';

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const sites = await listSites(user);
  const site = sites.find((s) => s.id === siteId);
  if (!site) notFound();

  return (
    <ToastProvider>
      <AppShell user={user} sites={sites} site={site}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
