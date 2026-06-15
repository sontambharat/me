import { ForbiddenError } from '../core/errors.js';

/**
 * Role-Based Access Control for the MVP roles.
 *
 *   Super Admin    — manage all sites, engines, users
 *   Site Admin     — manage one site: users, templates, settings
 *   Editor         — build and edit pages, widgets, shared content
 *   Reviewer       — view shared previews, comment, approve/reject
 *   Guest Reviewer — view-only via shareable link, comment if enabled
 *
 * Permissions are coarse-grained verbs scoped to a site. Site-scoped roles
 * (everything except super_admin) only apply within the user's `siteIds`.
 */
export const ROLES = ['super_admin', 'site_admin', 'editor', 'reviewer', 'guest_reviewer'];

const PERMISSIONS = {
  super_admin: ['*'],
  site_admin: [
    'site:read',
    'site:manage',
    'user:manage',
    'template:read',
    'template:write',
    'page:read',
    'page:write',
    'page:transition',
    'widget:read',
    'widget:write',
    'shared:read',
    'shared:write',
    'preview:create',
    'review:manage',
    'comment:write',
    'review:decide',
  ],
  editor: [
    'site:read',
    'template:read',
    'template:write',
    'page:read',
    'page:write',
    'page:transition',
    'widget:read',
    'widget:write',
    'shared:read',
    'shared:write',
    'preview:create',
    'review:manage',
    'comment:write',
  ],
  reviewer: ['site:read', 'page:read', 'preview:create', 'comment:write', 'review:decide'],
  guest_reviewer: ['comment:write'],
};

export function hasPermission(user, permission, siteId = null) {
  if (!user) return false;
  for (const role of user.roles ?? []) {
    const grants = PERMISSIONS[role.role] ?? [];
    const scopeOk = role.role === 'super_admin' || !siteId || role.siteId === siteId;
    if (!scopeOk) continue;
    if (grants.includes('*') || grants.includes(permission)) return true;
  }
  return false;
}

export function requirePermission(user, permission, siteId = null) {
  if (!hasPermission(user, permission, siteId)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

export function isSuperAdmin(user) {
  return (user?.roles ?? []).some((r) => r.role === 'super_admin');
}

/** Sites this user can see, or null meaning "all sites". */
export function visibleSiteIds(user) {
  if (isSuperAdmin(user)) return null;
  return [...new Set((user?.roles ?? []).map((r) => r.siteId).filter(Boolean))];
}
