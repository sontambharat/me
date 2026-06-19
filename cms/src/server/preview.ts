import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { parseJson, toJson } from '@/lib/json';
import { hasPermission, type SessionUser } from '@/lib/rbac';
import type { PageContent } from '@/lib/content';
import { notFound, forbidden, validation, AppError } from './errors';
import { resolveContent, buildRenderContext } from './build';

const EXPIRY: Record<string, number> = {
  '1h': 3600e3,
  '24h': 86400e3,
  '7d': 604800e3,
};

export async function createPreviewLink(
  user: SessionUser,
  input: { pageId: string; expiry?: string; expiresAt?: string; scope?: string },
) {
  const page = await prisma.page.findUnique({ where: { id: input.pageId } });
  if (!page) throw notFound('Page');
  if (!hasPermission(user, 'preview:create', page.siteId)) throw forbidden('Missing permission: preview:create');
  let expiresAt: Date | null = null;
  const expiry = input.expiry ?? '7d';
  if (expiry === 'custom') {
    if (!input.expiresAt) throw validation('custom expiry requires expiresAt');
    expiresAt = new Date(input.expiresAt);
  } else if (expiry !== 'none') {
    const ms = EXPIRY[expiry];
    if (!ms) throw validation(`Unknown expiry preset: ${expiry}`);
    expiresAt = new Date(Date.now() + ms);
  }
  const link = await prisma.previewLink.create({
    data: {
      pageId: page.id,
      siteId: page.siteId,
      versionId: page.currentVersionId ?? '',
      token: randomBytes(20).toString('base64url'),
      scope: input.scope ?? 'page',
      expiresAt,
      createdBy: user.id,
    },
  });
  return link;
}

export async function listPreviewLinks(user: SessionUser, pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  if (!hasPermission(user, 'preview:create', page.siteId)) throw forbidden('Missing permission: preview:create');
  const links = await prisma.previewLink.findMany({ where: { pageId }, orderBy: { createdAt: 'desc' } });
  return links.map((l) => ({ ...l, status: linkStatus(l), views: parseJson<any[]>(l.views, []).length }));
}

export async function revokePreviewLink(user: SessionUser, id: string) {
  const link = await prisma.previewLink.findUnique({ where: { id } });
  if (!link) throw notFound('Preview link');
  if (!hasPermission(user, 'preview:create', link.siteId)) throw forbidden('Missing permission: preview:create');
  await prisma.previewLink.update({ where: { id }, data: { revoked: true } });
  return { ok: true };
}

/** Public, login-free resolution of a shareable link. Records a view. */
export async function resolvePreviewLink(token: string, viewer: { ip?: string; session?: string } = {}) {
  const link = await prisma.previewLink.findUnique({ where: { token } });
  if (!link) throw notFound('Preview link');
  const status = linkStatus(link);
  if (status !== 'active') throw new AppError(`Preview link is ${status}`, 410, 'gone');

  const views = parseJson<any[]>(link.views, []);
  views.push({ at: new Date().toISOString(), ip: viewer.ip ?? null, session: viewer.session ?? randomBytes(6).toString('hex') });
  await prisma.previewLink.update({ where: { id: link.id }, data: { views: toJson(views) } });

  const [page, version] = await Promise.all([
    prisma.page.findUnique({ where: { id: link.pageId } }),
    prisma.pageVersion.findUnique({ where: { id: link.versionId } }),
  ]);
  const content = parseJson<PageContent>(version?.content, { slots: {} });
  const [resolved, ctx, comments] = await Promise.all([
    resolveContent(content),
    buildRenderContext(link.siteId, true),
    publicComments(link.pageId),
  ]);
  return {
    link: { id: link.id, scope: link.scope, expiresAt: link.expiresAt },
    page: page ? { id: page.id, title: page.title, slug: page.slug, state: page.state, siteId: page.siteId } : null,
    content: resolved,
    metadata: parseJson<any>(version?.metadata, {}),
    ctx,
    comments,
  };
}

function linkStatus(l: { revoked: boolean; expiresAt: Date | null }) {
  if (l.revoked) return 'revoked';
  if (l.expiresAt && l.expiresAt < new Date()) return 'expired';
  return 'active';
}

// ---- Comments ------------------------------------------------------------
export async function addComment(
  actor: SessionUser | { guest: true; name: string; linkToken: string },
  input: { pageId: string; parentId?: string; pin?: any; body: string; visibility?: string },
) {
  const page = await prisma.page.findUnique({ where: { id: input.pageId } });
  if (!page) throw notFound('Page');
  if (!input.body?.trim()) throw validation('Comment body is required');
  let authorId: string | null = null;
  let authorName: string;
  let visibility = input.visibility ?? 'internal';
  if ('guest' in actor) {
    const link = await prisma.previewLink.findUnique({ where: { token: actor.linkToken } });
    if (!link || linkStatus(link) !== 'active') throw forbidden('Invalid or expired preview link');
    authorName = actor.name || 'Guest reviewer';
    visibility = 'external';
  } else {
    if (!hasPermission(actor, 'comment:write', page.siteId)) throw forbidden('Missing permission: comment:write');
    authorId = actor.id;
    authorName = actor.name;
  }
  return prisma.comment.create({
    data: {
      pageId: input.pageId,
      siteId: page.siteId,
      parentId: input.parentId ?? null,
      pin: input.pin ? toJson(input.pin) : null,
      body: input.body.trim(),
      authorId,
      authorName,
      visibility,
      state: input.parentId ? null : 'open',
    },
  });
}

export async function listComments(user: SessionUser, pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  if (!hasPermission(user, 'page:read', page.siteId)) throw forbidden('Missing permission: page:read');
  return threaded(await prisma.comment.findMany({ where: { pageId }, orderBy: { createdAt: 'asc' } }));
}

export async function setCommentState(user: SessionUser, id: string, state: string) {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) throw notFound('Comment');
  if (!hasPermission(user, 'comment:write', comment.siteId)) throw forbidden('Missing permission: comment:write');
  if (!['open', 'in_progress', 'resolved'].includes(state)) throw validation('Unknown comment state');
  return prisma.comment.update({ where: { id }, data: { state } });
}

async function publicComments(pageId: string) {
  const rows = await prisma.comment.findMany({ where: { pageId, visibility: 'external' }, orderBy: { createdAt: 'asc' } });
  return threaded(rows);
}

function threaded(rows: any[]) {
  const parse = (c: any) => ({ ...c, pin: parseJson<any>(c.pin, null) });
  const roots = rows.filter((c) => !c.parentId).map(parse);
  return roots.map((root) => ({ ...root, replies: rows.filter((c) => c.parentId === root.id).map(parse) }));
}
