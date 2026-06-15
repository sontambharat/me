/**
 * Seed demo data: two sites, users covering every role, templates, widgets,
 * shared content and a couple of pages — enough to exercise the whole MVP.
 */
export function seed(app) {
  const { auth, build, store } = app;
  store.reset();

  const superAdmin = auth.createUser({
    email: 'admin@demo.test',
    password: 'demo1234',
    name: 'Ada Admin',
    roles: [{ role: 'super_admin', siteId: null }],
  });

  const site = build.createSite(superAdmin, { name: 'Acme Marketing', key: 'acme' });
  const blog = build.createSite(superAdmin, { name: 'Acme Blog', key: 'acme-blog' });

  const editor = auth.createUser({
    email: 'editor@demo.test',
    password: 'demo1234',
    name: 'Ed Editor',
    roles: [{ role: 'editor', siteId: site.id }],
  });
  const reviewer = auth.createUser({
    email: 'reviewer@demo.test',
    password: 'demo1234',
    name: 'Rita Reviewer',
    roles: [{ role: 'reviewer', siteId: site.id }],
  });

  // Global + site widgets.
  const hero = build.createWidget(superAdmin, {
    name: 'Hero Banner',
    type: 'hero',
    category: 'marketing',
    schema: {
      heading: { type: 'string', required: true },
      subheading: { type: 'string' },
      ctaLabel: { type: 'string' },
      ctaUrl: { type: 'string' },
    },
  });
  const richText = build.createWidget(superAdmin, {
    name: 'Rich Text',
    type: 'richtext',
    category: 'content',
    schema: { html: { type: 'string', required: true } },
  });
  build.createWidget(superAdmin, {
    name: 'Call To Action',
    type: 'cta',
    category: 'marketing',
    schema: { label: { type: 'string', required: true }, url: { type: 'string', required: true } },
  });

  // Shared content fragment, referenced by id from pages.
  const disclaimer = build.createSharedContent(superAdmin, {
    siteId: null,
    key: 'legal-disclaimer',
    type: 'richtext',
    data: { html: '<p>© Acme Inc. All rights reserved.</p>' },
  });

  const template = build.createTemplate(editor, {
    siteId: site.id,
    name: 'Landing Page',
    slots: ['header', 'hero', 'body', 'footer'],
    schema: {
      hero: { allowedWidgetTypes: ['hero'] },
      body: { allowedWidgetTypes: ['richtext', 'cta'] },
    },
  });

  const page = build.createPage(editor, {
    siteId: site.id,
    templateId: template.id,
    title: 'Summer Launch',
    slug: 'summer-launch',
    metadata: { seoTitle: 'Summer Launch | Acme', description: 'Our biggest launch yet.' },
  });

  build.updatePage(editor, page.id, {
    note: 'Add hero + body',
    content: {
      slots: {
        header: [],
        hero: [
          {
            instanceId: 'i1',
            widgetId: hero.id,
            type: 'hero',
            props: { heading: 'Summer is here', subheading: 'Save 30% this week', ctaLabel: 'Shop now', ctaUrl: '/shop' },
          },
        ],
        body: [
          { instanceId: 'i2', widgetId: richText.id, type: 'richtext', props: { html: '<p>Discover the new collection.</p>' } },
        ],
        footer: [{ instanceId: 'i3', type: 'shared_ref', props: { sharedContentId: disclaimer.id } }],
      },
    },
  });

  // A second site page so the site switcher has something on each side.
  const blogTemplate = build.createTemplate(superAdmin, { siteId: blog.id, name: 'Article', slots: ['header', 'body', 'footer'] });
  build.createPage(superAdmin, { siteId: blog.id, templateId: blogTemplate.id, title: 'Hello World', slug: 'hello-world' });

  return { superAdmin, editor, reviewer, site, blog, page, template };
}

// Allow `npm run seed` to (re)build the demo store on disk.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createApp } = await import('./src/app.js');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const app = createApp({ dataFile: process.env.DATA_FILE ?? join(__dirname, 'data', 'cms.json') });
  seed(app);
  console.log('Seeded demo data → login admin@demo.test / demo1234');
}
