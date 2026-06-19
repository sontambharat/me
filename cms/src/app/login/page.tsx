'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/apiClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.test');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-12 text-white lg:flex" style={{ background: 'linear-gradient(140deg,#4f46e5,#1e293b)' }}>
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">◆</span> Multi-Site CMS
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight">Build, preview, and ship content across every site.</h1>
          <p className="mt-4 max-w-md text-white/80">
            A headless, engine-based CMS with a visual drag-and-drop builder, media library, theming, and shareable previews.
          </p>
        </div>
        <p className="text-sm text-white/60">Next.js · Prisma · Azure Blob Storage</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="card w-full max-w-sm p-8">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Welcome back. Enter your credentials to continue.</p>

          <label className="label mt-6">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <label className="label mt-4">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <button type="submit" disabled={busy} className="btn btn-primary mt-6 w-full py-2.5">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-6 rounded-lg bg-subtle p-3 text-xs text-muted">
            <div className="font-medium text-slate-600">Demo accounts (password: demo1234)</div>
            <div className="mt-1">admin@demo.test · editor@demo.test · reviewer@demo.test</div>
          </div>
        </form>
      </div>
    </div>
  );
}
