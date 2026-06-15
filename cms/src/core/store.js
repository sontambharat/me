import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The shared Content Graph.
 *
 * A tiny document store backed by a single JSON file. It deliberately has zero
 * native dependencies so the MVP runs anywhere Node runs — no Postgres, no
 * build step. The public surface (collection/insert/update/find) is small and
 * synchronous on purpose; a production build would swap the persistence guts
 * for PostgreSQL behind this exact interface.
 *
 * Writes are atomic (write-temp-then-rename) so a crash mid-save can never
 * corrupt the graph.
 */
const COLLECTIONS = [
  'users',
  'sites',
  'templates',
  'pages',
  'pageVersions',
  'widgets',
  'sharedContent',
  'previewLinks',
  'comments',
  'reviewRequests',
  'sessions',
  'outbox',
  'audit',
];

export class Store {
  constructor(filePath, { persist = true } = {}) {
    this.filePath = filePath;
    this.persist = persist;
    this._data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    if (persist && filePath && existsSync(filePath)) {
      this._load();
    }
  }

  _load() {
    const raw = JSON.parse(readFileSync(this.filePath, 'utf8'));
    for (const c of COLLECTIONS) this._data[c] = raw[c] ?? [];
  }

  _flush() {
    if (!this.persist || !this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this._data, null, 2));
    renameSync(tmp, this.filePath);
  }

  collection(name) {
    if (!this._data[name]) throw new Error(`Unknown collection: ${name}`);
    return this._data[name];
  }

  insert(name, doc) {
    this.collection(name).push(doc);
    this._flush();
    return doc;
  }

  find(name, predicate) {
    return this.collection(name).filter(predicate);
  }

  findOne(name, predicate) {
    return this.collection(name).find(predicate) ?? null;
  }

  byId(name, id) {
    return this.findOne(name, (d) => d.id === id);
  }

  update(name, id, patch) {
    const doc = this.byId(name, id);
    if (!doc) return null;
    Object.assign(doc, typeof patch === 'function' ? patch(doc) : patch);
    doc.updatedAt = new Date().toISOString();
    this._flush();
    return doc;
  }

  remove(name, id) {
    const arr = this.collection(name);
    const idx = arr.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    this._flush();
    return true;
  }

  /** Reset everything — used by the test suite and the seed script. */
  reset() {
    for (const c of COLLECTIONS) this._data[c] = [];
    this._flush();
  }
}
