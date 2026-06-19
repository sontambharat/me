# Multi-Site CMS

A headless, engine-based CMS for managing content across multiple sites — with a
visual drag-and-drop page builder, inline on-canvas editing, a media library,
per-site theming, forms, navigation, and shareable previews.

Built on the production stack: **Next.js + React + TypeScript + Prisma**, with
**Azure Blob Storage** for media and **PostgreSQL** in production (**SQLite** for
local development so it runs anywhere with no cloud setup).

➡️ **The application lives in [`cms/`](./cms/).** See [`cms/README.md`](./cms/README.md)
for the full feature list, architecture, and production (Postgres + Azure) setup.

## Quick start

```bash
cd cms
npm install
npm run db:reset      # SQLite schema + demo data
npm run dev           # http://localhost:3000  (login: admin@demo.test / demo1234)
```
