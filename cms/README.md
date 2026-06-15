# Multi-Site CMS — Phase 1 MVP

A headless, **engine-based** CMS for managing content across multiple sites. This
repository implements the **Phase 1 MVP**: the **Build Engine** (authoring) and
the **Preview Engine** (collaborative review), plus the shared **content graph**
and **event bus** they communicate through.

It is written in plain Node.js with **zero runtime dependencies**, so it runs on
a bare Node install with no database, build step, or external services:

```bash
cd cms
node server.js        # http://localhost:3000
# Demo login: admin@demo.test / demo1234
npm test              # 18 engine + workflow tests (node:test)
```

On first run the store is empty, so a demo dataset is seeded automatically (two
sites, users for every role, templates, widgets, shared content and pages).

## Why this shape

The recommended production stack (Next.js + Fastify + PostgreSQL + S3 +
Resend) needs infrastructure that isn't available in an ephemeral sandbox. To
deliver something **actually runnable and testable**, this MVP keeps the same
architecture and domain model but swaps the infrastructure for dependency-free
equivalents behind narrow interfaces:

| Production (recommended) | This MVP | Swap point |
|---|---|---|
| PostgreSQL | JSON document store (atomic writes) | `src/core/store.js` |
| Redis / NATS event bus | in-process pub/sub | `src/core/eventBus.js` |
| Resend / Postmark email | in-app outbox (logged + stored) | `src/notifications/outbox.js` |
| Next.js CMS UI | vanilla JS SPA | `public/` |
| WebSocket realtime | request/refresh | — |

Each is isolated so a production build replaces the guts without touching the
engines.

## Architecture

```
        ┌──────────────┐         events          ┌────────────────┐
        │ Build Engine │ ───────────────────────▶│ Preview Engine │
        │  (authoring) │   page.updated, etc.    │   (review)     │
        └──────┬───────┘◀─── reviewGate() ───────└───────┬────────┘
               │                                          │
               ▼                                          ▼
        ┌──────────────────────────────────────────────────────┐
        │     Shared Content Graph (store)  +  Event Bus        │
        └──────────────────────────────────────────────────────┘
```

- **Decoupling** — the Build Engine never imports the Preview Engine. It emits
  events (`page.updated`, `page.state_changed`, …); the Preview Engine reacts
  (notify reviewers, auto-expire links). The one explicit seam is the review
  **approval gate**: Build asks Preview, via an injected `reviewGate(pageId)`
  callback, whether reviewers have signed off before allowing `in_review →
  approved`.
- **Versioning** — every page edit creates a new immutable version. Restore is
  append-only (it creates a fresh version from an old snapshot), so history is
  never rewritten.

```
src/
  core/      store.js · eventBus.js · ids.js · errors.js
  auth/      auth.js (scrypt + sessions) · rbac.js (5 roles)
  engines/   buildEngine.js · previewEngine.js
  notifications/ outbox.js
  http/      server.js · router.js · routes.js
  app.js     composition root (wires the engines + review gate)
public/      index.html/app.js (CMS UI) · preview.html/preview.js (public preview) · renderer.js (shared)
test/        buildEngine.test.js · previewEngine.test.js
```

## MVP feature coverage

**Build Engine (Phase 1)** — all ✅ items implemented:
basic template builder (fixed slots + per-slot widget-type rules), page builder
(block/slot editor, metadata, slug), multi-site isolation + site switcher,
standard widget builder (schema + validation + preview), shared content
(reference-by-id with automatic propagation to consumers), revision history
(list + restore). Phase-2 items (external-API widgets, personalization, diff
view, scheduled publish, template inheritance) are intentionally out.

**Preview Engine (Phase 1)** — all ✅ items implemented:
in-CMS live preview (desktop/tablet/mobile), shareable tokenized links
(24h/7d/custom/no-expiry, revoke, auto-expire on publish, view analytics),
pin-based inline comments with threads + states (open/in-progress/resolved) and
internal/external visibility, review request workflow (assign reviewers, email
notification with link), approval/rejection gate (rejection requires a comment
and returns the page to draft), and change notifications to in-flight reviewers
when a page is edited mid-review. Lightweight per-link/per-page analytics and a
CSV review-summary export are included.

> Beyond the strict checklist, two Phase-2 niceties came along for free because
> the model supported them: `@email` mentions in comments and emoji reactions.

## Roles (RBAC)

`super_admin` (all sites) · `site_admin` (one site) · `editor` (build/edit) ·
`reviewer` (preview, comment, approve/reject) · `guest_reviewer` (view + comment
via a shareable link, no account). Permissions are site-scoped; see
`src/auth/rbac.js`.

## HTTP API (selected)

```
POST   /api/auth/login                          → { token, user }
GET    /api/sites                               GET/POST sites
GET/POST /api/sites/:siteId/templates|widgets|shared-content|pages
GET/PATCH /api/pages/:pageId                    read / edit (new version)
POST   /api/pages/:pageId/transition            { state }
GET    /api/pages/:pageId/versions              POST .../:versionId/restore
POST   /api/pages/:pageId/preview-links         DELETE /api/preview-links/:id
GET    /api/preview/:token                      public, no auth — records a view
POST   /api/preview/:token/comments             guest comment via link
GET/POST /api/pages/:pageId/comments            PATCH /api/comments/:id/state
GET/POST /api/pages/:pageId/reviews             POST /api/reviews/:id/decision
GET    /api/pages/:pageId/analytics             review-summary?format=csv
GET    /api/outbox                              inspect notifications (no real mailer)
```

Authenticate with `Authorization: Bearer <token>`.

## Try the review loop

1. Sign in as `editor@demo.test`, open **Summer Launch**, edit content, **Save**.
2. **Share** tab → create a 7-day preview link, open it (no login) and leave a
   pin comment as a guest.
3. **Review** tab → request review from `reviewer@demo.test`. The page moves to
   *In Review* and an email lands in the **Outbox**.
4. Edit the page again — reviewers get a *change notification* (Outbox).
5. Sign in as `reviewer@demo.test`, **Review** tab → Approve. The page advances
   to *Approved* (the gate blocks editors from approving early). Publish it and
   the preview links auto-expire.

## Out of scope (later phases)

Compile / Publish / Render engines, external-API & personalized widgets, A/B
testing, password-protected links, preview-as-segment, i18n, and a real asset
DAM — as listed in the requirements doc.
