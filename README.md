# Multi-Site CMS

A headless, engine-based CMS for managing content across multiple sites.

This repository contains the **Phase 1 MVP** — the **Build Engine** (authoring)
and **Preview Engine** (collaborative review), built on a shared content graph
and event bus.

➡️ **The application lives in [`cms/`](./cms/).** See [`cms/README.md`](./cms/README.md)
for architecture, the MVP feature-coverage map, and the API reference.

## Quick start

```bash
cd cms
node server.js        # http://localhost:3000  (demo login: admin@demo.test / demo1234)
npm test              # engine + workflow tests
```

Zero runtime dependencies — runs on a bare Node.js (>=20) install with no
database or external services.
