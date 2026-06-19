'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/apiClient';
import { ROLE_LABELS, type Role, type SessionUser } from '@/lib/rbac';
import type { SiteTheme } from '@/lib/content';

interface SiteLite { id: string; name: string; key: string; theme: SiteTheme }

const NAV = [
  { href: 'pages', label: 'Pages', icon: 'pages' },
  { href: 'media', label: 'Media Library', icon: 'media' },
  { href: 'navigation', label: 'Navigation', icon: 'nav' },
  { href: 'forms', label: 'Form Submissions', icon: 'forms' },
  { href: 'settings', label: 'Templates & Theme', icon: 'settings' },
] as const;

export function AppShell({
  user,
  sites,
  site,
  children,
}: {
  user: SessionUser;
  sites: SiteLite[];
  site: SiteLite;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  // Recolor the whole product UI to the active site's brand.
  const brand = hexToRgb(site.theme?.accent) ?? '79 70 229';

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const topRole = user.roles[0]?.role as Role | undefined;

  return (
    <div className="flex h-screen overflow-hidden" style={{ ['--brand' as any]: brand }}>
      <aside className="flex w-64 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: 'rgb(var(--brand))' }}>
            ◆
          </span>
          <span className="font-semibold tracking-tight">Multi-Site CMS</span>
        </div>

        {/* Site switcher */}
        <div className="border-b border-line p-3">
          <label className="label">Workspace</label>
          <div className="relative">
            <select
              value={site.id}
              disabled={switching}
              onChange={(e) => {
                setSwitching(true);
                router.push(`/s/${e.target.value}/pages`);
              }}
              className="input cursor-pointer appearance-none pr-8 font-medium"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const href = `/s/${site.id}/${item.href}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'text-white' : 'text-slate-600 hover:bg-subtle'
                }`}
                style={active ? { background: 'rgb(var(--brand))' } : undefined}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-subtle font-semibold text-slate-600">
              {user.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted">{topRole ? ROLE_LABELS[topRole] : ''}</div>
            </div>
            <button onClick={logout} title="Sign out" className="btn btn-ghost btn-sm">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function hexToRgb(hex?: string): string | null {
  if (!hex) return null;
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
