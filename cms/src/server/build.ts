import { prisma } from '@/lib/prisma';
import { parseJson, toJson } from '@/lib/json';
import { hasPermission, visibleSiteIds, type Permission, type SessionUser } from '@/lib/rbac';
import {
  type Instance,
  type PageContent,
  type RenderContext,
  type SiteTheme,
  type NavItem,
  emptyContentForSlots,
  walkInstances,
} from '@/lib/content';
import { AppError, notFound, forbidden, conflict, validation } from './errors';

export const PAGE_STATES = ['draft', 'in_review', 'approved', 'published', 'archived'] as const;
const TRANSITIONS: Record<string, string[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'draft', 'archived'],
  approved: ['published', 'draft', 'archived'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

function must(user: SessionUser | null, perm: Permission, siteId: string | null = null) {
  if (!hasPermission(user, perm, siteId)) throw forbidden(`Missing permission: ${perm}`);
}

export function slugify(s: string): string {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---- Sites ---------------------------------------------------------------
export async function listSites(user: SessionUser) {
  const allowed = visibleSiteIds(user);
  const sites = await prisma.site.findMany({ orderBy: { createdAt: 'asc' } });
  return sites
    .filter((s) => allowed === null || allowed.includes(s.id))
    .map((s) => ({ ...s, theme: parseJson<SiteTheme>(s.theme, {}) }));
}

export async function getSite(user: SessionUser, siteId: string) {
  must(user, 'site:read', siteId);
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw notFound('Site');
  return { ...site, theme: parseJson<SiteTheme>(site.theme, {}) };
}

export async function createSite(user: SessionUser, input: { name: string; key?: string; theme?: SiteTheme }) {
  must(user, 'site:manage');
  if (!input.name) throw validation('Site name is required');
  const key = input.key || slugify(input.name);
  if (await prisma.site.findUnique({ where: { key } })) throw conflict(`Site key "${key}" already in use`);
  const site = await prisma.site.create({ data: { name: input.name, key, theme: toJson(input.theme ?? {}) } });
  await prisma.navigation.create({ data: { siteId: site.id, items: '[]' } });
  return site;
}

export async function updateSiteTheme(user: SessionUser, siteId: string, theme: SiteTheme) {
  must(user, 'site:manage', siteId);
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw notFound('Site');
  const merged = { ...parseJson<SiteTheme>(site.theme, {}), ...theme };
  return prisma.site.update({ where: { id: siteId }, data: { theme: toJson(merged) } });
}

// ---- Templates -----------------------------------------------------------
export async function listTemplates(user: SessionUser, siteId: string) {
  must(user, 'template:read', siteId);
  const rows = await prisma.template.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } });
  return rows.map(deserializeTemplate);
}

export async function getTemplate(templateId: string) {
  const t = await prisma.template.findUnique({ where: { id: templateId } });
  if (!t) throw notFound('Template');
  return deserializeTemplate(t);
}

export async function createTemplate(
  user: SessionUser,
  input: { siteId: string; name: string; slots?: string[]; schema?: Record<string, any> },
) {
  must(user, 'template:write', input.siteId);
  if (!input.name) throw validation('Template name is required');
  const slots = [...new Set(input.slots ?? ['header', 'hero', 'body', 'footer'])];
  const t = await prisma.template.create({
    data: { siteId: input.siteId, name: input.name, slots: toJson(slots), schema: toJson(input.schema ?? {}) },
  });
  return deserializeTemplate(t);
}

export async function updateTemplate(
  user: SessionUser,
  templateId: string,
  input: { name?: string; slots?: string[]; schema?: Record<string, any> },
) {
  const existing = await getTemplate(templateId);
  must(user, 'template:write', existing.siteId);
  const t = await prisma.template.update({
    where: { id: templateId },
    data: {
      name: input.name ?? existing.name,
      slots: input.slots ? toJson([...new Set(input.slots)]) : undefined,
      schema: input.schema ? toJson(input.schema) : undefined,
      version: { increment: 1 },
    },
  });
  return deserializeTemplate(t);
}

function deserializeTemplate(t: any) {
  return { ...t, slots: parseJson<string[]>(t.slots, []), schema: parseJson<Record<string, any>>(t.schema, {}) };
}

// ---- Widget library ------------------------------------------------------
export async function listWidgets(user: SessionUser, siteId: string) {
  must(user, 'widget:read', siteId);
  const rows = await prisma.widgetDef.findMany({ where: { OR: [{ siteId: null }, { siteId }] }, orderBy: { name: 'asc' } });
  return rows.map((w) => ({ ...w, schema: parseJson<Record<string, any>>(w.schema, {}) }));
}

export async function createWidget(
  user: SessionUser,
  input: { siteId: string | null; name: string; type: string; schema?: Record<string, any>; category?: string },
) {
  must(user, 'widget:write', input.siteId);
  if (!input.name || !input.type) throw validation('Widget name and type are required');
  const w = await prisma.widgetDef.create({
    data: {
      siteId: input.siteId,
      name: input.name,
      type: input.type,
      schema: toJson(input.schema ?? {}),
      renderer: input.type,
      category: input.category ?? 'general',
    },
  });
  return { ...w, schema: parseJson<Record<string, any>>(w.schema, {}) };
}

// ---- Shared content ------------------------------------------------------
export async function listSharedContent(user: SessionUser, siteId: string) {
  must(user, 'shared:read', siteId);
  const rows = await prisma.sharedContent.findMany({ where: { OR: [{ siteId: null }, { siteId }] }, orderBy: { key: 'asc' } });
  return rows.map((c) => ({ ...c, data: parseJson<any>(c.data, {}) }));
}

export async function createSharedContent(
  user: SessionUser,
  input: { siteId: string | null; key: string; type?: string; data: any },
) {
  must(user, 'shared:write', input.siteId);
  if (!input.key) throw validation('Shared content key is required');
  const c = await prisma.sharedContent.create({
    data: { siteId: input.siteId, key: input.key, type: input.type ?? 'richtext', data: toJson(input.data) },
  });
  return { ...c, data: parseJson<any>(c.data, {}) };
}

export async function updateSharedContent(user: SessionUser, id: string, input: { data?: any; type?: string }) {
  const c = await prisma.sharedContent.findUnique({ where: { id } });
  if (!c) throw notFound('Shared content');
  must(user, 'shared:write', c.siteId);
  const updated = await prisma.sharedContent.update({
    where: { id },
    data: { data: input.data !== undefined ? toJson(input.data) : undefined, type: input.type, revision: { increment: 1 } },
  });
  return { ...updated, data: parseJson<any>(updated.data, {}) };
}

// ---- Navigation ----------------------------------------------------------
export async function getNavigation(siteId: string): Promise<NavItem[]> {
  const nav = await prisma.navigation.findUnique({ where: { siteId } });
  return parseJson<NavItem[]>(nav?.items, []);
}

export async function updateNavigation(user: SessionUser, siteId: string, items: NavItem[]) {
  must(user, 'nav:write', siteId);
  await prisma.navigation.upsert({
    where: { siteId },
    create: { siteId, items: toJson(items) },
    update: { items: toJson(items) },
  });
  return items;
}

// ---- Pages ---------------------------------------------------------------
export async function listPages(user: SessionUser, siteId: string) {
  must(user, 'page:read', siteId);
  const pages = await prisma.page.findMany({ where: { siteId }, orderBy: { updatedAt: 'desc' } });
  return Promise.all(pages.map((p) => withCurrent(p)));
}

export async function getPage(user: SessionUser, pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  must(user, 'page:read', page.siteId);
  return withCurrent(page);
}

export async function createPage(
  user: SessionUser,
  input: { siteId: string; templateId: string; title: string; slug?: string; metadata?: any },
) {
  must(user, 'page:write', input.siteId);
  const template = await getTemplate(input.templateId);
  if (template.siteId !== input.siteId) throw validation('Template belongs to another site');
  if (!input.title) throw validation('Page title is required');
  const slug = input.slug || slugify(input.title);
  if (await prisma.page.findUnique({ where: { siteId_slug: { siteId: input.siteId, slug } } })) {
    throw conflict(`Slug "${slug}" already exists on this site`);
  }
  const content = emptyContentForSlots(template.slots);
  const page = await prisma.page.create({
    data: { siteId: input.siteId, templateId: input.templateId, title: input.title, slug, createdBy: user.id },
  });
  const version = await snapshot(page.id, page.siteId, user.id, {
    title: input.title,
    slug,
    metadata: input.metadata ?? {},
    content,
  }, 'Initial draft');
  await prisma.page.update({ where: { id: page.id }, data: { currentVersionId: version.id } });
  return getPage(user, page.id);
}

export async function updatePage(
  user: SessionUser,
  pageId: string,
  input: { title?: string; slug?: string; metadata?: any; content?: PageContent; note?: string },
) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  must(user, 'page:write', page.siteId);
  if (page.state === 'archived') throw conflict('Archived pages cannot be edited');
  const prev = await prisma.pageVersion.findUnique({ where: { id: page.currentVersionId ?? '' } });
  const next = {
    title: input.title ?? prev?.title ?? page.title,
    slug: input.slug ?? prev?.slug ?? page.slug,
    metadata: input.metadata ?? parseJson<any>(prev?.metadata, {}),
    content: input.content ?? parseJson<PageContent>(prev?.content, { slots: {} }),
  };
  if (next.slug !== page.slug) {
    const clash = await prisma.page.findFirst({ where: { siteId: page.siteId, slug: next.slug, NOT: { id: page.id } } });
    if (clash) throw conflict(`Slug "${next.slug}" already exists on this site`);
  }
  await validateContent(page.templateId, next.content);
  const version = await snapshot(page.id, page.siteId, user.id, next, input.note ?? 'Edit');
  await prisma.page.update({ where: { id: pageId }, data: { title: next.title, slug: next.slug, currentVersionId: version.id } });
  return getPage(user, pageId);
}

export async function listVersions(user: SessionUser, pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  must(user, 'page:read', page.siteId);
  const rows = await prisma.pageVersion.findMany({ where: { pageId }, orderBy: { version: 'desc' } });
  return rows.map((v) => ({ ...v, metadata: parseJson<any>(v.metadata, {}), content: parseJson<PageContent>(v.content, { slots: {} }) }));
}

export async function restoreVersion(user: SessionUser, pageId: string, versionId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  must(user, 'page:write', page.siteId);
  const src = await prisma.pageVersion.findUnique({ where: { id: versionId } });
  if (!src || src.pageId !== pageId) throw notFound('Version');
  const version = await snapshot(page.id, page.siteId, user.id, {
    title: src.title,
    slug: src.slug,
    metadata: parseJson<any>(src.metadata, {}),
    content: parseJson<PageContent>(src.content, { slots: {} }),
  }, `Restored from v${src.version}`);
  await prisma.page.update({ where: { id: pageId }, data: { title: src.title, slug: src.slug, currentVersionId: version.id } });
  return getPage(user, pageId);
}

export async function transitionPage(user: SessionUser, pageId: string, toState: string, reason?: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw notFound('Page');
  must(user, 'page:transition', page.siteId);
  if (!PAGE_STATES.includes(toState as any)) throw validation(`Unknown state: ${toState}`);
  if (!(TRANSITIONS[page.state] ?? []).includes(toState)) {
    throw conflict(`Cannot move page from "${page.state}" to "${toState}"`);
  }
  await prisma.page.update({ where: { id: pageId }, data: { state: toState } });
  await prisma.audit.create({ data: { userId: user.id, siteId: page.siteId, action: 'page.state_changed', data: toJson({ pageId, from: page.state, to: toState, reason }) } });
  return getPage(user, pageId);
}

// ---- rendering helpers ---------------------------------------------------
export async function resolveContent(content: PageContent): Promise<PageContent> {
  // Inline shared content references anywhere in the tree.
  const ids = new Set<string>();
  walkInstances(content.slots, (inst) => {
    if (inst.type === 'shared_ref' && inst.props?.sharedContentId) ids.add(inst.props.sharedContentId);
  });
  const shared = ids.size
    ? await prisma.sharedContent.findMany({ where: { id: { in: [...ids] } } })
    : [];
  const map = new Map(shared.map((s) => [s.id, { data: parseJson<any>(s.data, {}), type: s.type, revision: s.revision }]));
  const resolveInst = (inst: Instance): Instance => {
    if (inst.type === 'shared_ref') return { ...inst, resolved: map.get(inst.props?.sharedContentId) ?? null };
    if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
      return { ...inst, props: { ...inst.props, cols: (inst.props.cols as Instance[][]).map((c) => (c ?? []).map(resolveInst)) } };
    }
    return inst;
  };
  const slots: Record<string, Instance[]> = {};
  for (const [name, arr] of Object.entries(content.slots)) slots[name] = arr.map(resolveInst);
  return { slots };
}

/** Build the render context (theme, nav, page list) used by nav/list widgets. */
export async function buildRenderContext(siteId: string, preview = false): Promise<RenderContext> {
  const [site, nav, pages] = await Promise.all([
    prisma.site.findUnique({ where: { id: siteId } }),
    getNavigation(siteId),
    prisma.page.findMany({ where: { siteId, state: preview ? undefined : 'published' }, orderBy: { updatedAt: 'desc' } }),
  ]);
  return {
    theme: parseJson<SiteTheme>(site?.theme, {}),
    nav,
    pages: pages.map((p) => ({ title: p.title, slug: p.slug, state: p.state, updatedAt: p.updatedAt.toISOString() })),
    preview,
  };
}

export function pageReferencesShared(content: PageContent, sharedId: string): boolean {
  let hit = false;
  walkInstances(content.slots, (inst) => {
    if (inst.type === 'shared_ref' && inst.props?.sharedContentId === sharedId) hit = true;
  });
  return hit;
}

async function snapshot(
  pageId: string,
  siteId: string,
  userId: string,
  data: { title: string; slug: string; metadata: any; content: PageContent },
  note: string,
) {
  const count = await prisma.pageVersion.count({ where: { pageId } });
  return prisma.pageVersion.create({
    data: {
      pageId,
      siteId,
      version: count + 1,
      title: data.title,
      slug: data.slug,
      metadata: toJson(data.metadata),
      content: toJson(data.content),
      note,
      createdBy: userId,
    },
  });
}

async function withCurrent(page: any) {
  const version = page.currentVersionId ? await prisma.pageVersion.findUnique({ where: { id: page.currentVersionId } }) : null;
  return {
    ...page,
    currentVersion: version
      ? { ...version, metadata: parseJson<any>(version.metadata, {}), content: parseJson<PageContent>(version.content, { slots: {} }) }
      : null,
  };
}

async function validateContent(templateId: string, content: PageContent) {
  const template = await getTemplate(templateId);
  if (!content?.slots) throw validation('Content must have slots');
  const widgetIds = new Set<string>();
  walkInstances(content.slots, (inst) => { if (inst.widgetId) widgetIds.add(inst.widgetId); });
  const widgets = widgetIds.size ? await prisma.widgetDef.findMany({ where: { id: { in: [...widgetIds] } } }) : [];
  const widgetMap = new Map(widgets.map((w) => [w.id, { ...w, schema: parseJson<Record<string, any>>(w.schema, {}) }]));

  for (const [slot, arr] of Object.entries(content.slots)) {
    if (!template.slots.includes(slot)) throw validation(`Slot "${slot}" is not defined on the template`);
    const rule = template.schema?.[slot];
    for (const inst of arr) {
      const structural = inst.type === 'shared_ref' || inst.type === 'layout';
      if (!structural && rule?.allowedWidgetTypes && !rule.allowedWidgetTypes.includes(inst.type)) {
        throw validation(`Widget type "${inst.type}" not allowed in slot "${slot}"`);
      }
      validateInstance(inst, widgetMap);
    }
  }
}

function validateInstance(inst: Instance, widgetMap: Map<string, any>) {
  if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
    for (const col of inst.props.cols as Instance[][]) for (const child of col ?? []) validateInstance(child, widgetMap);
    return;
  }
  const widget = inst.widgetId ? widgetMap.get(inst.widgetId) : null;
  if (!widget) return;
  const errors: string[] = [];
  for (const [field, def] of Object.entries<any>(widget.schema ?? {})) {
    const val = inst.props?.[field];
    if (def.required && (val === undefined || val === null || val === '')) errors.push(`"${field}" is required`);
  }
  if (errors.length) throw validation(`"${widget.name}" is missing required fields`, errors);
}

export { AppError };
