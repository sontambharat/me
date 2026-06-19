import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
const J = (v: unknown) => JSON.stringify(v);
const iid = () => `i_${randomBytes(5).toString('hex')}`;

async function main() {
  // Clean slate.
  await prisma.$transaction([
    prisma.formSubmission.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.reviewRequest.deleteMany(),
    prisma.previewLink.deleteMany(),
    prisma.pageVersion.deleteMany(),
    prisma.page.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.navigation.deleteMany(),
    prisma.sharedContent.deleteMany(),
    prisma.widgetDef.deleteMany(),
    prisma.template.deleteMany(),
    prisma.session.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.user.deleteMany(),
    prisma.site.deleteMany(),
    prisma.outbox.deleteMany(),
    prisma.audit.deleteMany(),
  ]);

  const admin = await prisma.user.create({
    data: { email: 'admin@demo.test', name: 'Ada Admin', passwordHash: hashPassword('demo1234'), roles: { create: [{ role: 'super_admin', siteId: null }] } },
  });

  const acme = await prisma.site.create({
    data: { name: 'Acme Marketing', key: 'acme', theme: J({ accent: '#4f46e5', accentFg: '#ffffff', font: 'Inter', pageBg: '#ffffff', radius: 12 }) },
  });
  const blog = await prisma.site.create({
    data: { name: 'Northwind Blog', key: 'northwind', theme: J({ accent: '#0d9488', accentFg: '#ffffff', font: 'Inter', pageBg: '#f8fafc', radius: 8 }) },
  });

  await prisma.user.create({ data: { email: 'editor@demo.test', name: 'Ed Editor', passwordHash: hashPassword('demo1234'), roles: { create: [{ role: 'editor', siteId: acme.id }] } } });
  await prisma.user.create({ data: { email: 'reviewer@demo.test', name: 'Rita Reviewer', passwordHash: hashPassword('demo1234'), roles: { create: [{ role: 'reviewer', siteId: acme.id }] } } });

  // Global widget library.
  const mk = (name: string, type: string, category: string, schema: any, siteId: string | null = null) =>
    prisma.widgetDef.create({ data: { name, type, category, schema: J(schema), renderer: type, siteId } });

  const hero = await mk('Hero Banner', 'hero', 'Marketing', { heading: { type: 'string', required: true }, subheading: { type: 'string' }, ctaLabel: { type: 'string' }, ctaUrl: { type: 'string' } });
  const richtext = await mk('Rich Text', 'richtext', 'Content', { html: { type: 'string', required: true } });
  await mk('Call To Action', 'cta', 'Marketing', { label: { type: 'string', required: true }, url: { type: 'string', required: true } });
  await mk('Image', 'image', 'Media', { src: { type: 'string', required: true }, alt: { type: 'string' }, caption: { type: 'string' } });
  await mk('Testimonial', 'testimonial', 'Content', { quote: { type: 'string', required: true }, author: { type: 'string', required: true }, role: { type: 'string' } });
  await mk('Form', 'form', 'Forms', { title: { type: 'string' }, fields: { type: 'array' }, submitLabel: { type: 'string' }, successMessage: { type: 'string' } });
  await mk('Navigation', 'nav', 'Navigation', {});
  await mk('Content List', 'list', 'Dynamic', { title: { type: 'string' }, limit: { type: 'number' } });

  const disclaimer = await prisma.sharedContent.create({ data: { siteId: null, key: 'legal-disclaimer', type: 'richtext', data: J({ html: '<p>© Acme Inc. All rights reserved.</p>' }) } });

  // Navigation menu for Acme.
  await prisma.navigation.create({ data: { siteId: acme.id, items: J([
    { id: 'n1', label: 'Home', url: '/' },
    { id: 'n2', label: 'Products', url: '/products', children: [{ id: 'n2a', label: 'Pricing', url: '/pricing' }] },
    { id: 'n3', label: 'Contact', url: '/contact' },
  ]) } });
  await prisma.navigation.create({ data: { siteId: blog.id, items: J([{ id: 'b1', label: 'Articles', url: '/' }, { id: 'b2', label: 'About', url: '/about' }]) } });

  const template = await prisma.template.create({ data: { siteId: acme.id, name: 'Landing Page', slots: J(['header', 'hero', 'body', 'footer']), schema: J({ hero: { allowedWidgetTypes: ['hero'] } }) } });
  const blogTemplate = await prisma.template.create({ data: { siteId: blog.id, name: 'Article', slots: J(['header', 'body', 'footer']) } });

  // A rich landing page that shows off layouts, forms, nav, list and shared content.
  const content = {
    slots: {
      header: [{ instanceId: iid(), type: 'nav', props: {} }],
      hero: [{ instanceId: iid(), widgetId: hero.id, type: 'hero', props: { heading: 'Summer is here', subheading: 'Save 30% on the entire collection this week only.', ctaLabel: 'Shop the sale', ctaUrl: '/shop' } }],
      body: [
        { instanceId: iid(), type: 'layout', props: { cols: [
          [{ instanceId: iid(), widgetId: richtext.id, type: 'richtext', props: { html: '<h2>Built for summer</h2><p>Lightweight, breathable, and ready for anything the season throws at you.</p>' } }],
          [{ instanceId: iid(), type: 'testimonial', props: { quote: 'Best purchase I made all year.', author: 'Jordan P.', role: 'Verified buyer' } }],
        ] } },
        { instanceId: iid(), type: 'form', props: { title: 'Get launch updates', submitLabel: 'Notify me', successMessage: 'Thanks — we’ll be in touch!', fields: [
          { name: 'name', label: 'Your name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
        ] } },
      ],
      footer: [{ instanceId: iid(), type: 'shared_ref', props: { sharedContentId: disclaimer.id } }],
    },
  };

  const page = await prisma.page.create({ data: { siteId: acme.id, templateId: template.id, title: 'Summer Launch', slug: 'summer-launch', state: 'draft', createdBy: admin.id } });
  const v1 = await prisma.pageVersion.create({ data: { pageId: page.id, siteId: acme.id, version: 1, title: page.title, slug: page.slug, metadata: J({ seoTitle: 'Summer Launch | Acme', description: 'Our biggest launch yet.' }), content: J(content), note: 'Initial draft', createdBy: admin.id } });
  await prisma.page.update({ where: { id: page.id }, data: { currentVersionId: v1.id } });

  const blogContent = { slots: { header: [{ instanceId: iid(), type: 'nav', props: {} }], body: [{ instanceId: iid(), type: 'list', props: { title: 'Latest articles', limit: 5 } }], footer: [] } };
  const bp = await prisma.page.create({ data: { siteId: blog.id, templateId: blogTemplate.id, title: 'Home', slug: 'home', state: 'published', createdBy: admin.id } });
  const bv = await prisma.pageVersion.create({ data: { pageId: bp.id, siteId: blog.id, version: 1, title: bp.title, slug: bp.slug, metadata: J({}), content: J(blogContent), note: 'Initial', createdBy: admin.id } });
  await prisma.page.update({ where: { id: bp.id }, data: { currentVersionId: bv.id } });

  console.log('Seeded. Login: admin@demo.test / demo1234 (also editor@ and reviewer@).');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
