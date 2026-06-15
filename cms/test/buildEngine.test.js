import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { seed } from '../seed.js';

function fresh() {
  const app = createApp({ persist: false });
  const ctx = seed(app);
  return { app, ...ctx };
}

test('seed builds two sites isolated per site', () => {
  const { app, superAdmin, site, blog } = fresh();
  const sites = app.build.listSites(superAdmin);
  assert.equal(sites.length, 2);
  const acmePages = app.build.listPages(superAdmin, site.id);
  const blogPages = app.build.listPages(superAdmin, blog.id);
  assert.ok(acmePages.every((p) => p.siteId === site.id));
  assert.ok(blogPages.every((p) => p.siteId === blog.id));
});

test('editor cannot create a site (RBAC)', () => {
  const { app, editor } = fresh();
  assert.throws(() => app.build.createSite(editor, { name: 'Nope' }), /permission/i);
});

test('reviewer cannot edit pages but can read', () => {
  const { app, reviewer, site } = fresh();
  const pages = app.build.listPages(reviewer, site.id);
  assert.ok(pages.length >= 1);
  assert.throws(
    () => app.build.createPage(reviewer, { siteId: site.id, templateId: 'x', title: 'X' }),
    /permission/i,
  );
});

test('duplicate slug on the same site is rejected', () => {
  const { app, editor, site, page } = fresh();
  const template = app.build.listTemplates(editor, site.id)[0];
  assert.throws(
    () => app.build.createPage(editor, { siteId: site.id, templateId: template.id, title: 'Dup', slug: page.slug }),
    /already exists/i,
  );
});

test('widget prop validation enforces required fields and types', () => {
  const { app, editor, site } = fresh();
  const hero = app.build.listWidgets(editor, site.id).find((w) => w.type === 'hero');
  assert.throws(
    () => app.build.validateWidgetProps(hero, {}),
    (err) => err.details.some((d) => /required/i.test(d)),
  );
  assert.throws(
    () => app.build.validateWidgetProps(hero, { heading: 123 }),
    (err) => err.details.some((d) => /type string/i.test(d)),
  );
  assert.doesNotThrow(() => app.build.validateWidgetProps(hero, { heading: 'ok' }));
});

test('template slot rules reject disallowed widget types', () => {
  const { app, editor, site, page } = fresh();
  assert.throws(
    () =>
      app.build.updatePage(editor, page.id, {
        content: { slots: { hero: [{ instanceId: 'x', type: 'cta', props: {} }], header: [], body: [], footer: [] } },
      }),
    /not allowed/i,
  );
});

test('every edit creates a new immutable version; restore appends', () => {
  const { app, editor, page } = fresh();
  const before = app.build.listVersions(editor, page.id);
  assert.ok(before.length >= 2); // initial + seed edit
  app.build.updatePage(editor, page.id, { title: 'Renamed' });
  const after = app.build.listVersions(editor, page.id);
  assert.equal(after.length, before.length + 1);

  const target = before.at(-1); // oldest = v1
  const restored = app.build.restoreVersion(editor, page.id, target.id);
  assert.equal(restored.currentVersion.title, target.title);
  assert.equal(app.build.listVersions(editor, page.id).length, after.length + 1);
});

test('shared content updates propagate to consuming pages', () => {
  const { app, superAdmin, page } = fresh();
  const shared = app.build.listSharedContent(superAdmin, page.siteId).find((c) => c.key === 'legal-disclaimer');
  const { consumers } = app.build.updateSharedContent(superAdmin, shared.id, {
    data: { html: '<p>Updated notice</p>' },
  });
  assert.ok(consumers.includes(page.id));

  const current = app.build.getPage(superAdmin, page.id).currentVersion;
  const resolved = app.build.resolveVersion(current);
  const ref = resolved.content.slots.footer[0];
  assert.equal(ref.resolved.data.html, '<p>Updated notice</p>');
});

test('page state machine rejects illegal transitions', () => {
  const { app, editor, page } = fresh();
  assert.throws(() => app.build.transition(editor, page.id, 'published'), /Cannot move/i);
  app.build.transition(editor, page.id, 'in_review');
  assert.equal(app.build.getPage(editor, page.id).state, 'in_review');
});
