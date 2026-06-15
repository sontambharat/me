import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { seed } from '../seed.js';

function fresh() {
  const app = createApp({ persist: false });
  const ctx = seed(app);
  return { app, ...ctx };
}

test('shareable link resolves publicly and records a view', () => {
  const { app, editor, page } = fresh();
  const link = app.preview.createPreviewLink(editor, { pageId: page.id, expiry: '24h' });
  assert.ok(link.url.includes(link.token));
  const resolved = app.preview.resolveLink(link.token, { ip: '1.2.3.4' });
  assert.equal(resolved.page.id, page.id);
  assert.ok(resolved.version.content.slots.hero.length === 1);

  const analytics = app.preview.linkAnalytics(editor, page.id);
  assert.equal(analytics.links[0].views, 1);
});

test('expired and revoked links are rejected', () => {
  const { app, editor, page } = fresh();
  const expired = app.preview.createPreviewLink(editor, {
    pageId: page.id,
    expiry: 'custom',
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.throws(() => app.preview.resolveLink(expired.token), /expired/i);

  const link = app.preview.createPreviewLink(editor, { pageId: page.id });
  app.preview.revokeLink(editor, link.id);
  assert.throws(() => app.preview.resolveLink(link.token), /revoked/i);
});

test('links auto-expire when the page is published', () => {
  const { app, superAdmin, editor, page } = fresh();
  const link = app.preview.createPreviewLink(editor, { pageId: page.id });
  app.build.transition(editor, page.id, 'in_review');
  app.build.transition(superAdmin, page.id, 'approved');
  app.build.transition(superAdmin, page.id, 'published');
  assert.throws(() => app.preview.resolveLink(link.token), /revoked/i);
});

test('guest comments via link are external; threads and states work', () => {
  const { app, editor, page } = fresh();
  const link = app.preview.createPreviewLink(editor, { pageId: page.id });
  const guest = app.preview.addComment(
    { guest: true, name: 'Sam Stakeholder', linkToken: link.token },
    { pageId: page.id, body: 'Make the headline bigger', pin: { x: 0.5, y: 0.2 } },
  );
  assert.equal(guest.visibility, 'external');
  assert.equal(guest.state, 'open');

  const reply = app.preview.addComment(editor, { pageId: page.id, parentId: guest.id, body: 'On it' });
  assert.equal(reply.parentId, guest.id);

  app.preview.setCommentState(editor, guest.id, 'resolved');
  const threads = app.preview.listComments(editor, page.id);
  const root = threads.find((c) => c.id === guest.id);
  assert.equal(root.state, 'resolved');
  assert.equal(root.replies.length, 1);

  // Public resolution only exposes external comments.
  const internal = app.preview.addComment(editor, { pageId: page.id, body: 'internal note', visibility: 'internal' });
  const pub = app.preview.resolveLink(link.token);
  assert.ok(!pub.comments.some((c) => c.id === internal.id));
});

test('approval gate blocks until required reviewers approve', () => {
  const { app, editor, reviewer, page } = fresh();
  const { review } = app.preview.requestReview(editor, { pageId: page.id, reviewerIds: [reviewer.id] });
  assert.equal(app.build.getPage(editor, page.id).state, 'in_review');

  // Editor cannot force-approve while a review is pending.
  assert.throws(() => app.build.transition(editor, page.id, 'approved'), /reviewer/i);

  // Reviewer email was sent with a link.
  assert.ok(app.outbox.for(reviewer.email).some((m) => m.kind === 'review_request'));

  app.preview.decide(reviewer, review.id, { decision: 'approve' });
  assert.equal(app.build.getPage(editor, page.id).state, 'approved');
});

test('rejection requires a comment and sends the page back to draft', () => {
  const { app, editor, reviewer, page } = fresh();
  const { review } = app.preview.requestReview(editor, { pageId: page.id, reviewerIds: [reviewer.id] });
  assert.throws(() => app.preview.decide(reviewer, review.id, { decision: 'reject' }), /comment is required/i);

  app.preview.decide(reviewer, review.id, { decision: 'reject', comment: 'Fix the CTA copy' });
  assert.equal(app.build.getPage(editor, page.id).state, 'draft');
  const comments = app.preview.listComments(editor, page.id);
  assert.ok(comments.some((c) => c.body.includes('Fix the CTA copy')));
});

test('editing a page mid-review notifies reviewers', () => {
  const { app, editor, reviewer, page } = fresh();
  app.preview.requestReview(editor, { pageId: page.id, reviewerIds: [reviewer.id] });
  const before = app.outbox.for(reviewer.email).length;
  app.build.updatePage(editor, page.id, { title: 'Summer Launch v2' });
  const after = app.outbox.for(reviewer.email);
  assert.ok(after.length > before);
  assert.ok(after.some((m) => m.kind === 'change_notification'));
});

test('non-reviewers cannot decide on a review', () => {
  const { app, editor, page } = fresh();
  const reviewer2 = app.auth.createUser({
    email: 'r2@demo.test',
    password: 'demo1234',
    name: 'Other',
    roles: [{ role: 'reviewer', siteId: page.siteId }],
  });
  const { review } = app.preview.requestReview(editor, { pageId: page.id, reviewerIds: [editor.id] });
  assert.throws(() => app.preview.decide(reviewer2, review.id, { decision: 'approve' }), /not a reviewer/i);
});

test('review summary exports CSV', () => {
  const { app, editor, reviewer, page } = fresh();
  const { review } = app.preview.requestReview(editor, { pageId: page.id, reviewerIds: [reviewer.id] });
  app.preview.decide(reviewer, review.id, { decision: 'approve', comment: 'LGTM' });
  const csv = app.preview.reviewSummary(editor, page.id, 'csv');
  assert.match(csv, /reviewer,email,status,comment,decidedAt/);
  assert.match(csv, /Rita Reviewer/);
  assert.match(csv, /approve/);
});
