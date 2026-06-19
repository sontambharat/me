import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <ToastProvider>{children}</ToastProvider>;
}
