import { uuid, token as makeToken } from '../core/ids.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError, AppError } from '../core/errors.js';
import { requirePermission } from '../auth/rbac.js';

const EXPIRY_PRESETS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export const COMMENT_STATES = ['open', 'in_progress', 'resolved'];

/**
 * Preview Engine — collaborative review layer.
 *
 * Shareable tokenized preview links, pin-based inline comments with threads,
 * and the review request → approval/rejection workflow. It is decoupled from
 * the Build Engine: it learns about edits and publishes through the event bus
 * and only calls back into Build to drive page-state transitions.
 */
export class PreviewEngine {
  constructor(store, eventBus, build, outbox, { baseUrl = 'http://localhost:3000' } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.build = build;
    this.outbox = outbox;
    this.baseUrl = baseUrl;

    // Notify in-flight reviewers when a page under review is edited.
    this.eventBus.on('page.updated', (e) => this._onPageUpdated(e));
    // Auto-expire shareable links once a page is published.
    this.eventBus.on('page.state_changed', (e) => {
      if (e.payload.to === 'published') this._revokeLinksForPage(e.payload.pageId, 'auto-expired on publish');
    });
  }

  // ---- Preview links -----------------------------------------------------
  createPreviewLink(user, { pageId, expiry = '7d', expiresAt = null, scope = 'page' }) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'preview:create', page.siteId);
    if (!['page', 'site'].includes(scope)) throw new ValidationError('scope must be "page" or "site"');

    let resolvedExpiry = null;
    if (expiry === 'custom') {
      if (!expiresAt) throw new ValidationError('custom expiry requires expiresAt');
      resolvedExpiry = new Date(expiresAt).toISOString();
    } else if (expiry !== 'none') {
      const ms = EXPIRY_PRESETS[expiry];
      if (!ms) throw new ValidationError(`Unknown expiry preset: ${expiry}`);
      resolvedExpiry = new Date(Date.now() + ms).toISOString();
    }

    const link = {
      id: uuid(),
      pageId,
      siteId: page.siteId,
      versionId: page.currentVersionId,
      token: makeToken(),
      scope,
      expiresAt: resolvedExpiry,
      revoked: false,
      createdBy: user.id,
      views: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.insert('previewLinks', link);
    this.eventBus.emit('preview.link_created', { link });
    return { ...link, url: this.previewUrl(link.token) };
  }

  previewUrl(token) {
    return `${this.baseUrl}/preview.html?token=${token}`;
  }

  listLinks(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'preview:create', page.siteId);
    return this.store
      .find('previewLinks', (l) => l.pageId === pageId)
      .map((l) => ({ ...l, url: this.previewUrl(l.token), live: this._linkStatus(l) === 'active' }));
  }

  revokeLink(user, linkId) {
    const link = this.store.byId('previewLinks', linkId);
    if (!link) throw new NotFoundError('Preview link');
    requirePermission(user, 'preview:create', link.siteId);
    this.store.update('previewLinks', linkId, { revoked: true });
    this.eventBus.emit('preview.link_revoked', { linkId });
    return { ok: true };
  }

  /** Public resolution of a shareable link — no CMS login required. */
  resolveLink(token, viewer = {}) {
    const link = this.store.findOne('previewLinks', (l) => l.token === token);
    if (!link) throw new NotFoundError('Preview link');
    const status = this._linkStatus(link);
    if (status !== 'active') throw new AppError(`Preview link is ${status}`, 410, 'gone');

    // Record the view for lightweight analytics.
    const view = {
      at: new Date().toISOString(),
      ip: viewer.ip ?? null,
      email: viewer.email ?? null,
      session: viewer.session ?? makeToken(8),
    };
    link.views.push(view);
    this.store.update('previewLinks', link.id, { views: link.views });

    const page = this.store.byId('pages', link.pageId);
    const version = this.store.byId('pageVersions', link.versionId);
    const resolved = this.build.resolveVersion(version);
    const site = this.store.byId('sites', link.siteId);
    return {
      link: { id: link.id, scope: link.scope, expiresAt: link.expiresAt },
      page: { id: page.id, title: page.title, slug: page.slug, state: page.state },
      site: site ? { id: site.id, name: site.name, theme: site.theme } : null,
      version: resolved,
      session: view.session,
      // External comments are visible to link recipients; internal ones are hidden.
      comments: this._publicComments(link.pageId),
    };
  }

  _linkStatus(link) {
    if (link.revoked) return 'revoked';
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return 'expired';
    return 'active';
  }

  _revokeLinksForPage(pageId, _reason) {
    for (const l of this.store.find('previewLinks', (l) => l.pageId === pageId && !l.revoked)) {
      this.store.update('previewLinks', l.id, { revoked: true });
    }
  }

  // ---- Comments ----------------------------------------------------------
  /**
   * Add a comment. `actor` is either a CMS user (has .id) or a guest from a
   * shareable link ({ guest: true, name, linkToken }). Guests always produce
   * externally-visible comments.
   */
  addComment(actor, { pageId, parentId = null, pin = null, body, visibility, attachments = [] }) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    if (!body || !body.trim()) throw new ValidationError('Comment body is required');

    let authorId = null;
    let authorName;
    let vis = visibility ?? 'internal';
    if (actor?.guest) {
      const link = this.store.findOne('previewLinks', (l) => l.token === actor.linkToken);
      if (!link || this._linkStatus(link) !== 'active') throw new ForbiddenError('Invalid or expired preview link');
      authorName = actor.name ?? 'Guest reviewer';
      vis = 'external'; // guests cannot post internal-only comments
    } else {
      requirePermission(actor, 'comment:write', page.siteId);
      authorId = actor.id;
      authorName = actor.name;
    }

    if (parentId) {
      const parent = this.store.byId('comments', parentId);
      if (!parent || parent.pageId !== pageId) throw new NotFoundError('Parent comment');
      if (parent.parentId) throw new ValidationError('Replies cannot be nested more than one level');
    }

    const comment = {
      id: uuid(),
      pageId,
      siteId: page.siteId,
      parentId,
      pin, // { x, y, selector } — null for general/thread replies
      body: body.trim(),
      authorId,
      authorName,
      visibility: vis,
      state: parentId ? null : 'open', // only top-level comments carry a state
      reactions: [], // [{ emoji, by }]
      attachments, // [{ name, url|dataRef }]
      stale: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.insert('comments', comment);
    this.eventBus.emit('comment.created', { comment });
    this._notifyMentions(page, comment);
    return comment;
  }

  listComments(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    return this._threaded(this.store.find('comments', (c) => c.pageId === pageId));
  }

  _publicComments(pageId) {
    const external = this.store.find('comments', (c) => c.pageId === pageId && c.visibility === 'external');
    return this._threaded(external);
  }

  _threaded(comments) {
    const roots = comments.filter((c) => !c.parentId).sort(byCreated);
    return roots.map((root) => ({
      ...root,
      replies: comments.filter((c) => c.parentId === root.id).sort(byCreated),
    }));
  }

  setCommentState(user, commentId, state) {
    const comment = this.store.byId('comments', commentId);
    if (!comment) throw new NotFoundError('Comment');
    requirePermission(user, 'comment:write', comment.siteId);
    if (comment.parentId) throw new ValidationError('Only top-level comments have a state');
    if (!COMMENT_STATES.includes(state)) throw new ValidationError(`Unknown comment state: ${state}`);
    const updated = this.store.update('comments', commentId, { state, stale: false });
    this.eventBus.emit('comment.state_changed', { commentId, state });
    return updated;
  }

  addReaction(actor, commentId, emoji) {
    const comment = this.store.byId('comments', commentId);
    if (!comment) throw new NotFoundError('Comment');
    if (!emoji) throw new ValidationError('emoji is required');
    const by = actor?.guest ? `guest:${actor.name ?? 'anon'}` : actor.id;
    const existing = comment.reactions.find((r) => r.emoji === emoji && r.by === by);
    if (!existing) comment.reactions.push({ emoji, by });
    return this.store.update('comments', commentId, { reactions: comment.reactions });
  }

  // ---- Review workflow ---------------------------------------------------
  requestReview(user, { pageId, reviewerIds = [], requiredReviewerIds = null, dueDate = null }) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'review:manage', page.siteId);
    if (reviewerIds.length === 0) throw new ValidationError('At least one reviewer is required');
    for (const rid of reviewerIds) {
      if (!this.store.byId('users', rid)) throw new NotFoundError(`Reviewer ${rid}`);
    }
    const required = requiredReviewerIds ?? reviewerIds;

    const review = {
      id: uuid(),
      pageId,
      siteId: page.siteId,
      reviewerIds,
      requiredReviewerIds: required,
      dueDate,
      status: 'pending', // pending | approved | rejected | cancelled
      decisions: [], // [{ reviewerId, decision, comment, at }]
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.insert('reviewRequests', review);

    // Move the page into review (if not already) and notify each reviewer with a link.
    if (page.state === 'draft') this.build.systemTransition(pageId, 'in_review', { actorId: user.id });
    const link = this.createPreviewLink(user, { pageId, expiry: '7d' });
    for (const rid of reviewerIds) {
      const reviewer = this.store.byId('users', rid);
      if (!reviewer) continue;
      this.outbox.send({
        to: reviewer.email,
        subject: `Review requested: ${page.title}`,
        body: `${user.name} asked you to review "${page.title}".${dueDate ? ` Due ${dueDate}.` : ''}\nReview here: ${link.url}`,
        kind: 'review_request',
        meta: { pageId, reviewId: review.id, linkToken: link.token },
      });
    }
    this.eventBus.emit('review.requested', { review, link });
    return { review, link };
  }

  decide(user, reviewId, { decision, comment }) {
    const review = this.store.byId('reviewRequests', reviewId);
    if (!review) throw new NotFoundError('Review request');
    requirePermission(user, 'review:decide', review.siteId);
    if (review.status !== 'pending') throw new ConflictError(`Review is already ${review.status}`);
    if (!review.reviewerIds.includes(user.id)) throw new ForbiddenError('You are not a reviewer on this request');
    if (!['approve', 'reject'].includes(decision)) throw new ValidationError('decision must be "approve" or "reject"');
    if (decision === 'reject' && !comment?.trim()) {
      throw new ValidationError('A comment is required when rejecting');
    }

    review.decisions = review.decisions.filter((d) => d.reviewerId !== user.id);
    review.decisions.push({ reviewerId: user.id, decision, comment: comment ?? null, at: new Date().toISOString() });
    this.store.update('reviewRequests', reviewId, { decisions: review.decisions });
    this._audit(user, review.siteId, `review.${decision}`, { reviewId, pageId: review.pageId, comment });

    const page = this.store.byId('pages', review.pageId);
    if (decision === 'reject') {
      this.store.update('reviewRequests', reviewId, { status: 'rejected' });
      // Rejection sends the page back to draft with the reviewer's note attached.
      this.addComment(user, { pageId: review.pageId, body: `Review rejected: ${comment}`, visibility: 'internal' });
      if (page.state === 'in_review') this.build.systemTransition(review.pageId, 'draft', { actorId: user.id, reason: `Rejected: ${comment}` });
      this._notifyAuthor(page, `"${page.title}" was rejected in review`, comment);
      this.eventBus.emit('review.rejected', { review, by: user.id });
    } else {
      const approvedBy = new Set(review.decisions.filter((d) => d.decision === 'approve').map((d) => d.reviewerId));
      const allApproved = review.requiredReviewerIds.every((rid) => approvedBy.has(rid));
      if (allApproved) {
        this.store.update('reviewRequests', reviewId, { status: 'approved' });
        if (page.state === 'in_review') this.build.systemTransition(review.pageId, 'approved', { actorId: user.id });
        this._notifyAuthor(page, `"${page.title}" was approved`, comment);
        this.eventBus.emit('review.approved', { review });
      }
    }
    return this.store.byId('reviewRequests', reviewId);
  }

  listReviews(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    return this.store.find('reviewRequests', (r) => r.pageId === pageId);
  }

  /** The approval gate consulted by BuildEngine on in_review → approved. */
  approvalGate(pageId) {
    const pending = this.store.find('reviewRequests', (r) => r.pageId === pageId && r.status === 'pending');
    if (pending.length === 0) return { blocked: false }; // no formal review in flight
    for (const review of pending) {
      const approvedBy = new Set(review.decisions.filter((d) => d.decision === 'approve').map((d) => d.reviewerId));
      const allApproved = review.requiredReviewerIds.every((rid) => approvedBy.has(rid));
      if (!allApproved) {
        const missing = review.requiredReviewerIds.filter((rid) => !approvedBy.has(rid)).length;
        return { blocked: true, reason: `${missing} required reviewer(s) have not approved yet` };
      }
    }
    return { blocked: false };
  }

  // ---- Analytics ---------------------------------------------------------
  linkAnalytics(user, pageId) {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    const links = this.store.find('previewLinks', (l) => l.pageId === pageId);
    const openThreads = this.store.find(
      'comments',
      (c) => c.pageId === pageId && !c.parentId && c.state !== 'resolved',
    ).length;
    return {
      pageId,
      totalShares: links.length,
      activeLinks: links.filter((l) => this._linkStatus(l) === 'active').length,
      openCommentThreads: openThreads,
      links: links.map((l) => ({
        id: l.id,
        status: this._linkStatus(l),
        views: l.views.length,
        uniqueViewers: new Set(l.views.map((v) => v.email ?? v.ip ?? v.session)).size,
        lastViewedAt: l.views.at(-1)?.at ?? null,
      })),
    };
  }

  /** Review summary suitable for PDF/CSV export. */
  reviewSummary(user, pageId, format = 'json') {
    const page = this.store.byId('pages', pageId);
    if (!page) throw new NotFoundError('Page');
    requirePermission(user, 'page:read', page.siteId);
    const reviews = this.store.find('reviewRequests', (r) => r.pageId === pageId);
    const comments = this.store.find('comments', (c) => c.pageId === pageId && !c.parentId);
    const rows = [];
    for (const review of reviews) {
      for (const rid of review.reviewerIds) {
        const reviewer = this.store.byId('users', rid);
        const decision = review.decisions.find((d) => d.reviewerId === rid);
        rows.push({
          reviewer: reviewer?.name ?? rid,
          email: reviewer?.email ?? '',
          status: decision?.decision ?? 'pending',
          comment: decision?.comment ?? '',
          decidedAt: decision?.at ?? '',
        });
      }
    }
    const summary = {
      page: { id: page.id, title: page.title, state: page.state },
      reviewers: rows,
      openComments: comments.filter((c) => c.state !== 'resolved').length,
      resolvedComments: comments.filter((c) => c.state === 'resolved').length,
      generatedAt: new Date().toISOString(),
    };
    if (format === 'csv') return toCsv(rows);
    return summary;
  }

  // ---- internals ---------------------------------------------------------
  _onPageUpdated({ payload }) {
    const { pageId, page, diff } = payload;
    const active = this.store.find('reviewRequests', (r) => r.pageId === pageId && r.status === 'pending');
    if (active.length === 0) return;
    const fields = diff?.changedFields?.join(', ') || 'content';
    const notified = new Set();
    for (const review of active) {
      for (const rid of review.reviewerIds) {
        if (notified.has(rid)) continue;
        notified.add(rid);
        const reviewer = this.store.byId('users', rid);
        if (!reviewer) continue;
        this.outbox.send({
          to: reviewer.email,
          subject: `Updated during review: ${page.title}`,
          body: `"${page.title}" changed while you were reviewing it. Changed: ${fields}.`,
          kind: 'change_notification',
          meta: { pageId, diff },
        });
      }
    }
    this.eventBus.emit('review.change_notified', { pageId, reviewers: [...notified] });
  }

  _notifyMentions(page, comment) {
    const mentions = (comment.body.match(/@([\w.+-]+@[\w.-]+)/g) ?? []).map((m) => m.slice(1));
    for (const email of new Set(mentions)) {
      this.outbox.send({
        to: email,
        subject: `You were mentioned on "${page.title}"`,
        body: `${comment.authorName}: ${comment.body}`,
        kind: 'mention',
        meta: { pageId: page.id, commentId: comment.id },
      });
    }
  }

  _notifyAuthor(page, subject, body) {
    const author = this.store.byId('users', page.createdBy);
    if (author) this.outbox.send({ to: author.email, subject, body: body ?? subject, kind: 'review_result', meta: { pageId: page.id } });
  }

  _audit(user, siteId, action, data) {
    this.store.insert('audit', {
      id: uuid(),
      userId: user.id,
      siteId,
      action,
      data,
      createdAt: new Date().toISOString(),
    });
  }
}

function byCreated(a, b) {
  return new Date(a.createdAt) - new Date(b.createdAt);
}

function toCsv(rows) {
  const headers = ['reviewer', 'email', 'status', 'comment', 'decidedAt'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}
