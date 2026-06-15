import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createApp } from './src/app.js';
import { createServer } from './src/http/server.js';
import { seed } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE ?? join(__dirname, 'data', 'cms.json');

const app = createApp({ dataFile: DATA_FILE, baseUrl: BASE_URL });

// First run with an empty store: seed demo data so the UI has something to show.
if (!existsSync(DATA_FILE) || app.store.collection('users').length === 0) {
  seed(app);
  console.log('Seeded demo data (login: admin@demo.test / demo1234)');
}

createServer(app).listen(PORT, () => {
  console.log(`Multi-Site CMS running at ${BASE_URL}`);
  console.log(`  CMS UI:        ${BASE_URL}/`);
  console.log(`  Demo login:    admin@demo.test / demo1234`);
});
