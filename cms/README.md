# Multi-Site CMS

A headless, engine-based CMS for managing content across multiple sites, built
on the production stack: **Next.js (App Router) + React + TypeScript + Prisma**,
with **Azure Blob Storage** for media and **PostgreSQL** in production
(**SQLite** for local/sandbox).

It ships a polished, product-grade UI with a **visual drag-and-drop page builder
featuring inline on-canvas editing**, a **media library (DAM)**, **per-site
theming and templates**, **forms, navigation and dynamic content-list widgets**,
and **shareable, login-free previews** with annotated feedback.

## Run it

```bash
cd cms
npm install
npm run db:reset      # create SQLite schema + seed demo data
npm run dev           # http://localhost:3000
```

Sign in with one of the seeded accounts (password `demo1234`):

| Account | Role |
|---|---|
| `admin@demo.test` | Super Admin (all sites) |
| `editor@demo.test` | Editor (Acme) |
| `reviewer@demo.test` | Reviewer (Acme) |

For a production build: `npm run build && npm run start`.

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| App & API | Next.js 15 App Router, React 19, TypeScript | Server Components for auth/loads, Route Handlers for the API |
| ORM / DB | Prisma 6 · SQLite (dev) → PostgreSQL (prod) | One schema; switch the `datasource` provider + `DATABASE_URL` |
| Media / DAM | Azure Blob Storage · local-disk fallback | `src/lib/storage.ts` |
| Auth | Cookie sessions (scrypt) + 5-role RBAC | `src/lib/auth.ts`, `src/lib/rbac.ts` |
| Styling | Tailwind CSS, CSS-variable theming | Site themes recolor the product UI and the canvas |

### Going to production

- **Database** — in `prisma/schema.prisma` change `provider = "sqlite"` to
  `"postgresql"` and point `DATABASE_URL` at your Postgres server, then
  `prisma migrate deploy`. Structured columns are stored as JSON strings so the
  switch needs no code changes (promote them to `jsonb` if you want querying).
- **Media** — set `AZURE_STORAGE_CONNECTION_STRING` (and optionally
  `AZURE_STORAGE_CONTAINER`). When present, uploads go to Azure Blob Storage;
  when absent (sandbox) they fall back to `./storage` on disk. Same interface
  either way (`putBlob` / `getBlob` / `deleteBlob`).
- **Email** — review/preview notifications are written to an outbox table and
  logged; wire `src/server/notify.ts` to Resend/Postmark/Azure Communication
  Services.

## Features

**Visual page builder** (`/editor/[siteId]/[pageId]`)
- Drag widgets from a categorised toolbox onto the canvas; drop zones on every
  template slot with a live insertion indicator.
- **Inline on-canvas editing** — click a hero headline, rich-text block, CTA or
  testimonial and type directly on the page (rich text has a B/I/H2/link bar).
- Drag the handle to reorder and move widgets between slots and **nested column
  layouts** (1–4 columns, themselves drop targets).
- Contextual **properties panel**, image picking from the media library, a
  **form-field builder**, duplicate/delete, device-framed live preview, page
  metadata/SEO, revision history with restore, and the page state machine
  (Draft → In Review → Approved → Published → Archived).

**Media Library (DAM)** — drag-and-drop upload to Azure Blob (or local),
grid browsing, delete, and an in-builder picker for image widgets.

**Templates & Theming** — create templates with chosen slot regions; brand each
site (color, page background, logo) with a live preview. The active site's brand
recolors the entire product UI.

**Forms, navigation & lists** — a Form widget with a visual field builder and a
submissions inbox; a Navigation menu manager rendered by the Nav widget; and a
dynamic Content-List widget that lists site pages.

**Preview & collaboration** — shareable tokenized preview links (expiry, revoke,
view tracking), a polished public preview page (no login) with device emulation,
**working forms**, and **pin-based annotated feedback** from guests.

**Multi-site & RBAC** — isolated content per site, a workspace switcher, and five
roles (Super Admin, Site Admin, Editor, Reviewer, Guest Reviewer) enforced in the
service layer.

## Project structure

```
prisma/schema.prisma        Full data model (sites, pages, versions, widgets,
                            shared content, assets, nav, forms, preview, comments…)
prisma/seed.ts              Demo data (two sites, roles, rich landing page)
src/lib/                    prisma, auth, rbac, storage (Azure/local), content types, tree ops
src/server/                 Domain services: build, preview, media, forms, notify
src/app/api/                Route handlers (REST-ish JSON API)
src/app/login               Sign-in
src/app/s/[siteId]/         Authed app shell: pages, media, navigation, forms, settings
src/app/editor/             Immersive page builder
src/app/preview/[token]     Public, login-free preview
src/components/             UI kit, shell, render (WidgetView/PageView), builder
```

## Notes & scope

This is the Phase-1 MVP scope (Build + Preview engines). The Compile, Publish and
Render engines, external-API/personalized widgets, A/B testing and i18n remain
out of scope. The reviewer approval workflow is present at the data layer and via
preview comments; a dedicated review-management screen is a natural next step.
