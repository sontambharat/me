import { Router } from './router.js';
import { AuthError } from '../core/errors.js';
import { publicUser } from '../auth/auth.js';
import { visibleSiteIds, isSuperAdmin } from '../auth/rbac.js';

/**
 * Wires HTTP endpoints to engine methods. Handlers receive a context
 * `{ user, params, body, query }` and return a JSON-serialisable value (or
 * `{ _status, _body }` / `{ _raw, _contentType }` to control the response).
 */
export function buildRouter(app) {
  const { auth, build, preview, store } = app;
  const r = new Router();
  const requireUser = (ctx) => {
    if (!ctx.user) throw new AuthError();
    return ctx.user;
  };

  // ---- Auth --------------------------------------------------------------
  r.post('/api/auth/login', ({ body }) => auth.login(body.email, body.password));
  r.post('/api/auth/logout', ({ token }) => {
    auth.logout(token);
    return { ok: true };
  });
  r.get('/api/me', (ctx) => ({ user: publicUser(requireUser(ctx)) }));

  // ---- Users (admin) -----------------------------------------------------
  r.post('/api/users', (ctx) => {
    const user = requireUser(ctx);
    if (!isSuperAdmin(user) && !user.roles.some((role) => role.role === 'site_admin')) {
      throw new AuthError('Only admins can create users');
    }
    return { user: publicUser(auth.createUser(ctx.body)) };
  });
  r.get('/api/users', (ctx) => {
    requireUser(ctx);
    return { users: store.collection('users').map(publicUser) };
  });

  // ---- Sites -------------------------------------------------------------
  r.get('/api/sites', (ctx) => ({ sites: build.listSites(requireUser(ctx)) }));
  r.post('/api/sites', (ctx) => ({ site: build.createSite(requireUser(ctx), ctx.body) }));
  r.get('/api/sites/:siteId', (ctx) => ({ site: build.getSite(requireUser(ctx), ctx.params.siteId) }));

  // ---- Templates ---------------------------------------------------------
  r.get('/api/sites/:siteId/templates', (ctx) => ({
    templates: build.listTemplates(requireUser(ctx), ctx.params.siteId),
  }));
  r.post('/api/sites/:siteId/templates', (ctx) => ({
    template: build.createTemplate(requireUser(ctx), { ...ctx.body, siteId: ctx.params.siteId }),
  }));

  // ---- Widget library ----------------------------------------------------
  r.get('/api/sites/:siteId/widgets', (ctx) => ({
    widgets: build.listWidgets(requireUser(ctx), ctx.params.siteId, ctx.query),
  }));
  r.post('/api/sites/:siteId/widgets', (ctx) => ({
    widget: build.createWidget(requireUser(ctx), {
      ...ctx.body,
      siteId: ctx.body.global ? null : ctx.params.siteId,
    }),
  }));

  // ---- Shared content ----------------------------------------------------
  r.get('/api/sites/:siteId/shared-content', (ctx) => ({
    items: build.listSharedContent(requireUser(ctx), ctx.params.siteId),
  }));
  r.post('/api/sites/:siteId/shared-content', (ctx) => ({
    item: build.createSharedContent(requireUser(ctx), {
      ...ctx.body,
      siteId: ctx.body.global ? null : ctx.params.siteId,
    }),
  }));
  r.patch('/api/shared-content/:id', (ctx) =>
    build.updateSharedContent(requireUser(ctx), ctx.params.id, ctx.body),
  );

  // ---- Pages -------------------------------------------------------------
  r.get('/api/sites/:siteId/pages', (ctx) => ({
    pages: build.listPages(requireUser(ctx), ctx.params.siteId),
  }));
  r.post('/api/sites/:siteId/pages', (ctx) => ({
    page: build.createPage(requireUser(ctx), { ...ctx.body, siteId: ctx.params.siteId }),
  }));
  r.get('/api/pages/:pageId', (ctx) => ({ page: build.getPage(requireUser(ctx), ctx.params.pageId) }));
  r.patch('/api/pages/:pageId', (ctx) => ({
    page: build.updatePage(requireUser(ctx), ctx.params.pageId, ctx.body),
  }));
  r.post('/api/pages/:pageId/transition', (ctx) => ({
    page: build.transition(requireUser(ctx), ctx.params.pageId, ctx.body.state, ctx.body),
  }));

  // ---- Revision history --------------------------------------------------
  r.get('/api/pages/:pageId/versions', (ctx) => ({
    versions: build.listVersions(requireUser(ctx), ctx.params.pageId),
  }));
  r.post('/api/pages/:pageId/versions/:versionId/restore', (ctx) => ({
    page: build.restoreVersion(requireUser(ctx), ctx.params.pageId, ctx.params.versionId),
  }));

  // ---- Preview links -----------------------------------------------------
  r.get('/api/pages/:pageId/preview-links', (ctx) => ({
    links: preview.listLinks(requireUser(ctx), ctx.params.pageId),
  }));
  r.post('/api/pages/:pageId/preview-links', (ctx) => ({
    link: preview.createPreviewLink(requireUser(ctx), { ...ctx.body, pageId: ctx.params.pageId }),
  }));
  r.del('/api/preview-links/:id', (ctx) => preview.revokeLink(requireUser(ctx), ctx.params.id));

  // Public link resolution — no auth required.
  r.get('/api/preview/:token', (ctx) =>
    preview.resolveLink(ctx.params.token, { ip: ctx.ip, email: ctx.query.email, session: ctx.query.session }),
  );
  // Guest comment via shareable link — no CMS account needed.
  r.post('/api/preview/:token/comments', (ctx) => ({
    comment: preview.addComment(
      { guest: true, name: ctx.body.name, linkToken: ctx.params.token },
      { ...ctx.body, pageId: ctx.body.pageId },
    ),
  }));

  // ---- Comments ----------------------------------------------------------
  r.get('/api/pages/:pageId/comments', (ctx) => ({
    comments: preview.listComments(requireUser(ctx), ctx.params.pageId),
  }));
  r.post('/api/pages/:pageId/comments', (ctx) => ({
    comment: preview.addComment(requireUser(ctx), { ...ctx.body, pageId: ctx.params.pageId }),
  }));
  r.patch('/api/comments/:id/state', (ctx) =>
    preview.setCommentState(requireUser(ctx), ctx.params.id, ctx.body.state),
  );
  r.post('/api/comments/:id/reactions', (ctx) =>
    preview.addReaction(requireUser(ctx), ctx.params.id, ctx.body.emoji),
  );

  // ---- Review workflow ---------------------------------------------------
  r.get('/api/pages/:pageId/reviews', (ctx) => ({
    reviews: preview.listReviews(requireUser(ctx), ctx.params.pageId),
  }));
  r.post('/api/pages/:pageId/reviews', (ctx) =>
    preview.requestReview(requireUser(ctx), { ...ctx.body, pageId: ctx.params.pageId }),
  );
  r.post('/api/reviews/:id/decision', (ctx) => ({
    review: preview.decide(requireUser(ctx), ctx.params.id, ctx.body),
  }));

  // ---- Analytics & export ------------------------------------------------
  r.get('/api/pages/:pageId/analytics', (ctx) =>
    preview.linkAnalytics(requireUser(ctx), ctx.params.pageId),
  );
  r.get('/api/pages/:pageId/review-summary', (ctx) => {
    const fmt = ctx.query.format ?? 'json';
    const data = preview.reviewSummary(requireUser(ctx), ctx.params.pageId, fmt);
    if (fmt === 'csv') return { _raw: data, _contentType: 'text/csv' };
    return data;
  });

  // ---- Outbox (inspect notifications in the absence of a real mailer) -----
  r.get('/api/outbox', (ctx) => {
    requireUser(ctx);
    return { messages: store.collection('outbox').slice(-50).reverse() };
  });

  // ---- Event log (audit/debug) -------------------------------------------
  r.get('/api/events', (ctx) => {
    requireUser(ctx);
    return { events: app.eventBus.log.slice(-100).reverse() };
  });

  return r;
}
