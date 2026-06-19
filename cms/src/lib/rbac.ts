export type Role = 'super_admin' | 'site_admin' | 'editor' | 'reviewer' | 'guest_reviewer';

export const ROLES: Role[] = ['super_admin', 'site_admin', 'editor', 'reviewer', 'guest_reviewer'];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  site_admin: 'Site Admin',
  editor: 'Editor',
  reviewer: 'Reviewer',
  guest_reviewer: 'Guest Reviewer',
};

export type Permission =
  | 'site:read'
  | 'site:manage'
  | 'user:manage'
  | 'template:read'
  | 'template:write'
  | 'page:read'
  | 'page:write'
  | 'page:transition'
  | 'widget:read'
  | 'widget:write'
  | 'shared:read'
  | 'shared:write'
  | 'asset:read'
  | 'asset:write'
  | 'nav:write'
  | 'form:read'
  | 'preview:create'
  | 'review:manage'
  | 'review:decide'
  | 'comment:write';

const PERMISSIONS: Record<Role, Permission[] | ['*']> = {
  super_admin: ['*'],
  site_admin: [
    'site:read', 'site:manage', 'user:manage', 'template:read', 'template:write',
    'page:read', 'page:write', 'page:transition', 'widget:read', 'widget:write',
    'shared:read', 'shared:write', 'asset:read', 'asset:write', 'nav:write',
    'form:read', 'preview:create', 'review:manage', 'review:decide', 'comment:write',
  ],
  editor: [
    'site:read', 'template:read', 'template:write', 'page:read', 'page:write',
    'page:transition', 'widget:read', 'widget:write', 'shared:read', 'shared:write',
    'asset:read', 'asset:write', 'nav:write', 'form:read', 'preview:create',
    'review:manage', 'comment:write',
  ],
  reviewer: ['site:read', 'page:read', 'preview:create', 'comment:write', 'review:decide'],
  guest_reviewer: ['comment:write'],
};

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: { role: Role; siteId: string | null }[];
}

export function isSuperAdmin(user: SessionUser | null): boolean {
  return !!user?.roles.some((r) => r.role === 'super_admin');
}

export function hasPermission(user: SessionUser | null, permission: Permission, siteId: string | null = null): boolean {
  if (!user) return false;
  for (const { role, siteId: roleSite } of user.roles) {
    const grants = PERMISSIONS[role];
    const scopeOk = role === 'super_admin' || !siteId || roleSite === siteId;
    if (!scopeOk) continue;
    if ((grants as string[]).includes('*') || (grants as string[]).includes(permission)) return true;
  }
  return false;
}

/** Site ids the user can see; null means "all sites". */
export function visibleSiteIds(user: SessionUser | null): string[] | null {
  if (isSuperAdmin(user)) return null;
  return [...new Set((user?.roles ?? []).map((r) => r.siteId).filter((s): s is string => !!s))];
}
