import { uuid } from '../core/ids.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../core/errors.js';
import { requirePermission, visibleSiteIds } from '../auth/rbac.js';

/** Page state machine (MVP). Publish/unpublish scheduling is Phase 2. */
export const PAGE_STATES = ['draft', 'in_review', 'approved', 'published', 'archived'];

const TRANSITIONS = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'draft', 'archived'],
  approved: ['published', 'draft', 'archived'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

const DEFAULT_SLOTS = ['header', 'hero', 'body', 'sidebar', 'footer'];

/**
 * Build Engine — the authoring and assembly layer.
 *
 * Owns sites, templates, the widget library, shared content fragments and
 * pages. Every meaningful mutation is versioned (pages) and/or announced on the
 * event bus so the Preview Engine can react (e.g. notify reviewers on edit).
 */
export class BuildEngine {
  constructor(store, eventBus) {
    this.store = store;
    this.eventBus = eventBus;
    /** Injected by the container: returns { blocked, reason } for in_review→approved. */
    this.reviewGate = () => ({ blocked: false });
  }

  // ---- Sites -------------------------------------------------------------
  createSite(user, { name, key, theme = {} }) {
    requirePermission(user, 'site:manage');
    if (!name) throw new ValidationError('Site name is required');
    const siteKey = key ?? slugify(name);
    if (this.store.findOne('sites', (s) => s.key === siteKey)) {
      throw new ConflictError(`Site key "${siteKey}" already in use`);
    }
    const site = stamp({ id: uuid(), name, key: siteKey, theme });
    this.store.insert('sites', site);
    this.eventBus.emit('site.created', { site });
    return site;
  }

  listSites(user) {
    const allowed = visibleSiteIds(user);
    return this.store.find('sites', (s) => allowed === null || allowed.includes(s.id));
  }

  getSite(user, siteId) {
    requirePermission(user, 'site:read', siteId);
    const site = this.store.byId('sites', siteId);
    if (!site) throw new NotFoundError('Site');
    return site;
  }

  // ---- Templates ---------------------------------------------------------
  createTemplate(user, { siteId, name, slots = DEFAULT_SLOTS, schema = {} }) {
    requirePermission(user, 'template:write', siteId);
    this._assertSite(siteId);
    if (!name) throw new ValidationError('Template name is required');
    const template = stamp({
      id: uuid(),
      siteId,
      name,
      slots: [...new Set(slots)],
      schema, // { slotName: { allowedWidgetTypes: [], required: bool } }
      version: 1,
    });
    this.store.insert('templates', template);
    this.eventBus.emit('template.created', { template });
    return template;
  }

  listTemplates(user, siteId) {
    requirePermission(user, 'template:read', siteId);
    return this.store.find('templates', (t) => t.siteId === siteId);
  }

  getTemplate(templateId) {
    const t = this.store.byId('templates', templateId);
    if (!t) throw new NotFoundError('Template');
    return t;
  }

  // ---- Widget library ----------------------------------------------------
  createWidget(user, { siteId = null, name, type, schema = {}, renderer, category = 'general' }) {
    requirePermission(user, 'widget:write', siteId);
    if (siteId) this._assertSite(siteId);
    if (!name || !type) throw new ValidationError('Widget name and type are required');
    const widget = stamp({
      id: uuid(),
      siteId, // null => global / cross-site
      name,
      type,
      schema, // { field: { type, required, default } }
      renderer: renderer ?? type,
      category,
      usageCount: 0,
    });
    this.store.insert('widgets', widget);
    this.eventBus.emit('widget.created', { widget });
    return widget;
  }

  /** Global widgets plus the site's own, optionally filtered by search/category. */
  listWidgets(user, siteId, { search, category } = {}) {
    requirePermission(user, 'widget:read', siteId);
    return this.store.find('widgets', (w) => {
      if (w.siteId !== null && w.siteId !== siteId) return false;
      if (category && w.category !== category) return false;
      if (search && !`${w.name} ${w.type}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  getWidget(widgetId) {
    const w = this.store.byId('widgets', widgetId);
    if (!w) throw new NotFoundError('Widget');
    return w;
  }

  /** Validate widget instance props against the widget's declared schema. */
  validateWidgetProps(widget, props = {}) {
    const errors = [];
    for (const [field, def] of Object.entries(widget.schema ?? {})) {
      const val = props[field];
      if (def.required && (val === undefined || val === null || val === '')) {
        errors.push(`"${field}" is required`);
        continue;
      }
      if (val !== undefined && def.type && actualType(val) !== def.type) {
        errors.push(`"${field}" must be of type ${def.type}`);
      }
    }
    if (errors.length) throw new ValidationError('Widget props failed validation', errors);
  }

  // ---- Shared content ----------------------------------------------------
  createSharedContent(user, { siteId = null, key, type = 'richtext', data }) {
    requirePermission(user, 'shared:write', siteId);
    if (siteId) this._assertSite(siteId);
    if (!key) throw new ValidationError('Shared content key is required');
    const content = stamp({
      id: uuid(),
      siteId,
      key,
      type, // richtext | structured | media
      data,
      revision: 1,
    });
    this.store.insert('sharedContent', content);
    this.eventBus.emit('shared.created', { content });
    return content;
  }

  listSharedContent(user, siteId) {
    requirePermission(user, 'shared:read', siteId);
    return this.store.find('sharedContent', (c) => c.siteId === null || c.siteId === siteId);
  }

  getSharedContent(id) {
    const c = this.store.byId('sharedContent', id);
    if (!c) throw new NotFoundError('Shared content');
    return c;
  }

  updateSharedContent(user, id, { data, type }) {
    const content = this.getSharedContent(id);
    requirePermission(user, 'shared:write', content.siteId);
    const updated = this.store.update('sharedContent', id, (c) => ({
      data: data ?? c.data,
      type: type ?? c.type,
      revision: c.revision + 1,
    }));
    // Referenced-by-ID means updates propagate automatically to consumers.
    const consumers = this.consumersOf(id);
    this.eventBus.emit('shared.updated', { content: updated, consumers });
    return { content: updated, consumers };
  }

  /** Pages whose current version references this shared content id. */
  consumersOf(sharedContentId) {
    const pages = [];
    for (const page of this.store.collection('pages')) {
      const v = this.store.byId('pageVersions', page.currentVersionId);
      if (v && versionReferencesShared(v, sharedContentId)) pages.push(page.id);
    }
    return pages;
  }

  // ---- Pages -------------------------------------------------------------
  createPage(user, { siteId, templateId, title, slug, metadata = {} }) {
    requirePermission(user, 'page:write', siteId);
    this._assertSite(siteId);
    const template = this.getTemplate(templateId);
    if (template.siteId !== siteId) throw new ValidationError('Template belongs to another site');
    if (!title) throw new ValidationError('Page title is required');
    const pageSlug = slug ?? slugify(title);
    if (this.store.findOne('pages', (p) => p.siteId === siteId && p.slug === pageSlug)) {
      throw new ConflictError(`Slug "${pageSlug}" already exists on this site`);
    }
    const now = new Date().toISOString();
    const page = {
      id: uuid(),
      siteId,
      templateId,
      title,
      slug: pageSlug,
      state: 'draft',
      currentVersionId: null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    const content = { slots: Object.fromEntries(template.slots.map((s) => [s, []])) };
    const version = this._snapshot(page, { title, slug: pageSlug, metadata, content }, user, 'Initial draft');
    page.currentVersionId = version.id;
    this.store.insert('pages', page);
    this.eventBus.emit('page.created', { page, version });
    return this._withCurrent(page);
  }

  listPages(user, siteId) {
    requirePermission(user, 'page:read', siteId);
    return this.store.find('pages', (p) => p.siteId === siteId).map((p) => this._withCurrent(p));
  }

  getPage(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    return this._withCurrent(page);
  }

  /**
   * Save an edit. Every save creates a new immutable version (revision
   * history) and emits page.updated carrying a field-level diff so the Preview
   * Engine can notify in-flight reviewers.
   */
  updatePage(user, pageId, { title, slug, metadata, content, note }) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:write', page.siteId);
    if (page.state === 'archived') throw new ConflictError('Archived pages cannot be edited');

    const prev = this.store.byId('pageVersions', page.currentVersionId);
    const next = {
      title: title ?? prev.title,
      slug: slug ?? prev.slug,
      metadata: metadata ?? prev.metadata,
      content: content ?? prev.content,
    };
    if (next.slug !== page.slug) {
      const clash = this.store.findOne(
        'pages',
        (p) => p.siteId === page.siteId && p.slug === next.slug && p.id !== page.id,
      );
      if (clash) throw new ConflictError(`Slug "${next.slug}" already exists on this site`);
    }
    this._validateContent(page.templateId, next.content);

    const version = this._snapshot(page, next, user, note ?? 'Edit');
    this.store.update('pages', pageId, {
      title: next.title,
      slug: next.slug,
      currentVersionId: version.id,
    });
    const diff = diffVersions(prev, version);
    this.eventBus.emit('page.updated', { pageId, page: this.store.byId('pages', pageId), version, diff });
    return this._withCurrent(this.store.byId('pages', pageId));
  }

  // ---- Revision history --------------------------------------------------
  listVersions(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    return this.store
      .find('pageVersions', (v) => v.pageId === pageId)
      .sort((a, b) => b.version - a.version);
  }

  restoreVersion(user, pageId, versionId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:write', page.siteId);
    const source = this.store.byId('pageVersions', versionId);
    if (!source || source.pageId !== pageId) throw new NotFoundError('Version');
    // Restore = create a fresh version from the old snapshot (history is append-only).
    const version = this._snapshot(
      page,
      { title: source.title, slug: source.slug, metadata: source.metadata, content: source.content },
      user,
      `Restored from v${source.version}`,
    );
    this.store.update('pages', pageId, {
      title: source.title,
      slug: source.slug,
      currentVersionId: version.id,
    });
    this.eventBus.emit('page.updated', { pageId, page: this.store.byId('pages', pageId), version, diff: { restored: true } });
    return this._withCurrent(this.store.byId('pages', pageId));
  }

  // ---- State transitions -------------------------------------------------
  /** User-initiated transition — checks RBAC and the review approval gate. */
  transition(user, pageId, toState, { reason } = {}) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:transition', page.siteId);
    return this._doTransition(user.id, pageId, toState, { reason, checkGate: true });
  }

  /**
   * Workflow-driven transition used by the Preview Engine (approval/rejection).
   * Authorization already happened at the review layer (review:decide /
   * review:manage), so RBAC and the gate are not re-checked here.
   */
  systemTransition(pageId, toState, { actorId = 'system', reason } = {}) {
    return this._doTransition(actorId, pageId, toState, { reason, checkGate: false });
  }

  _doTransition(actorId, pageId, toState, { reason, checkGate }) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    if (!PAGE_STATES.includes(toState)) throw new ValidationError(`Unknown state: ${toState}`);
    const allowed = TRANSITIONS[page.state] ?? [];
    if (!allowed.includes(toState)) {
      throw new ConflictError(`Cannot move page from "${page.state}" to "${toState}"`);
    }
    if (checkGate && page.state === 'in_review' && toState === 'approved') {
      const gate = this.reviewGate(pageId);
      if (gate.blocked) throw new ForbiddenError(gate.reason ?? 'Required reviewers have not approved');
    }
    const from = page.state;
    this.store.update('pages', pageId, { state: toState });
    this.store.insert('audit', stamp({ id: uuid(), userId: actorId, siteId: page.siteId, action: 'page.state_changed', data: { pageId, from, to: toState, reason } }));
    this.eventBus.emit('page.state_changed', { pageId, page: this.store.byId('pages', pageId), from, to: toState, by: actorId, reason });
    return this._withCurrent(this.store.byId('pages', pageId));
  }

  /** Render a page version with shared-content references resolved live. */
  resolveVersion(version) {
    const content = structuredClone(version.content);
    for (const slot of Object.keys(content.slots ?? {})) {
      content.slots[slot] = content.slots[slot].map((inst) => this._resolveInstance(inst));
    }
    return { ...version, content };
  }

  /** Resolve shared references anywhere in the tree, including nested layouts. */
  _resolveInstance(inst) {
    if (inst.type === 'shared_ref' && inst.props?.sharedContentId) {
      const shared = this.store.byId('sharedContent', inst.props.sharedContentId);
      return { ...inst, resolved: shared ? { data: shared.data, type: shared.type, revision: shared.revision } : null };
    }
    if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
      const cols = inst.props.cols.map((children) => (children ?? []).map((c) => this._resolveInstance(c)));
      return { ...inst, props: { ...inst.props, cols } };
    }
    return inst;
  }

  // ---- internals ---------------------------------------------------------
  _snapshot(page, { title, slug, metadata, content }, user, note) {
    const count = this.store.find('pageVersions', (v) => v.pageId === page.id).length;
    const version = stamp({
      id: uuid(),
      pageId: page.id,
      siteId: page.siteId,
      version: count + 1,
      title,
      slug,
      metadata,
      content,
      note,
      createdBy: user.id,
    });
    this.store.insert('pageVersions', version);
    return version;
  }

  _withCurrent(page) {
    const version = this.store.byId('pageVersions', page.currentVersionId);
    return { ...page, currentVersion: version };
  }

  /** Validate a single instance's widget props, recursing into layout columns. */
  _validateInstance(inst) {
    if (inst.type === 'layout' && Array.isArray(inst.props?.cols)) {
      for (const col of inst.props.cols) for (const child of col ?? []) this._validateInstance(child);
      return;
    }
    if (inst.widgetId) {
      const widget = this.store.byId('widgets', inst.widgetId);
      if (widget) this.validateWidgetProps(widget, inst.props);
    }
  }

  _validateContent(templateId, content) {
    const template = this.getTemplate(templateId);
    if (!content?.slots) throw new ValidationError('Content must have slots');
    for (const slot of Object.keys(content.slots)) {
      if (!template.slots.includes(slot)) {
        throw new ValidationError(`Slot "${slot}" is not defined on the template`);
      }
      const rule = template.schema?.[slot];
      for (const inst of content.slots[slot]) {
        // shared_ref and layout are structural containers, allowed in any slot.
        if (inst.type === 'shared_ref' || inst.type === 'layout') {
          this._validateInstance(inst);
          continue;
        }
        if (rule?.allowedWidgetTypes && !rule.allowedWidgetTypes.includes(inst.type)) {
          throw new ValidationError(`Widget type "${inst.type}" not allowed in slot "${slot}"`);
        }
        this._validateInstance(inst);
      }
    }
  }

  _assertSite(siteId) {
    if (!this.store.byId('sites', siteId)) throw new NotFoundError('Site');
  }
}

// ---- helpers -------------------------------------------------------------
function stamp(doc) {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now, ...doc };
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function actualType(v) {
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function versionReferencesShared(version, sharedId) {
  const hit = (inst) => {
    if (inst.type === 'shared_ref' && inst.props?.sharedContentId === sharedId) return true;
    if (inst.type === 'layout') return (inst.props?.cols ?? []).some((col) => (col ?? []).some(hit));
    return false;
  };
  for (const slot of Object.values(version.content?.slots ?? {})) {
    if (slot.some(hit)) return true;
  }
  return false;
}

/** Shallow field-level diff between two page versions (for change notifications). */
export function diffVersions(prev, next) {
  if (!prev) return { created: true };
  const changed = [];
  for (const field of ['title', 'slug']) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  if (JSON.stringify(prev.metadata) !== JSON.stringify(next.metadata)) changed.push('metadata');
  if (JSON.stringify(prev.content) !== JSON.stringify(next.content)) changed.push('content');
  return { changedFields: changed, fromVersion: prev.version, toVersion: next.version };
}
