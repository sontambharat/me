import { renderPage } from '/renderer.js';

// ---- tiny helpers --------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  token: localStorage.getItem('cms_token'),
  user: null,
  sites: [],
  siteId: null,
  pages: [],
  pageId: null,
  page: null,
  widgets: [],
  shared: [],
  users: [],
  tab: 'content',
  device: 'desktop',
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, isError = false) {
  const t = el(`<div class="toast ${isError ? 'error' : ''}">${esc(msg)}</div>`);
  $('#toast').append(t);
  setTimeout(() => t.remove(), 3200);
}

// ---- bootstrap -----------------------------------------------------------
async function boot() {
  if (!state.token) return renderLogin();
  try {
    const { user } = await api('/me');
    state.user = user;
    await loadSites();
    renderApp();
  } catch {
    state.token = null;
    localStorage.removeItem('cms_token');
    renderLogin();
  }
}

function renderLogin() {
  document.body.querySelector('#app').replaceChildren(
    el(`
    <div class="login">
      <h1>Multi-Site CMS</h1>
      <div class="card">
        <label>Email</label><input id="email" value="admin@demo.test" />
        <label>Password</label><input id="password" type="password" value="demo1234" />
        <div style="margin-top:14px"><button class="primary" id="loginBtn">Sign in</button></div>
        <p class="hint">Demo roles — admin@demo.test (super admin), editor@demo.test (editor), reviewer@demo.test (reviewer). Password: demo1234</p>
      </div>
    </div>`),
  );
  $('#loginBtn').onclick = async () => {
    try {
      const { token } = await api('/auth/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } });
      state.token = token;
      localStorage.setItem('cms_token', token);
      boot();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

async function loadSites() {
  const { sites } = await api('/sites');
  state.sites = sites;
  if (!state.siteId || !sites.find((s) => s.id === state.siteId)) state.siteId = sites[0]?.id ?? null;
  await loadSiteData();
}

async function loadSiteData() {
  if (!state.siteId) return;
  const [{ pages }, { widgets }, { items }, usersResp] = await Promise.all([
    api(`/sites/${state.siteId}/pages`),
    api(`/sites/${state.siteId}/widgets`),
    api(`/sites/${state.siteId}/shared-content`),
    api('/users').catch(() => ({ users: [] })),
  ]);
  state.pages = pages;
  state.widgets = widgets;
  state.shared = items;
  state.users = usersResp.users;
  if (!state.pages.find((p) => p.id === state.pageId)) state.pageId = state.pages[0]?.id ?? null;
  await loadPage();
}

async function loadPage() {
  if (!state.pageId) return (state.page = null);
  const { page } = await api(`/pages/${state.pageId}`);
  state.page = page;
}

// ---- main shell ----------------------------------------------------------
function renderApp() {
  const app = $('#app');
  app.replaceChildren(
    el(`<div class="topbar">
      <span class="brand">⬢ Multi-Site CMS</span>
      <select id="siteSwitcher"></select>
      <button class="small" id="newPage">+ Page</button>
      <span class="spacer"></span>
      <button class="small" id="outboxBtn">✉ Outbox</button>
      <span class="muted">${esc(state.user.name)} · ${esc(state.user.roles.map((r) => r.role).join(', '))}</span>
      <button class="small" id="logout">Logout</button>
    </div>`),
  );
  const layout = el(`<div class="layout"><aside class="sidebar" id="sidebar"></aside><main class="main" id="main"></main></div>`);
  app.append(layout);

  const sw = $('#siteSwitcher');
  sw.replaceChildren(...state.sites.map((s) => el(`<option value="${s.id}" ${s.id === state.siteId ? 'selected' : ''}>${esc(s.name)}</option>`)));
  sw.onchange = async () => { state.siteId = sw.value; state.pageId = null; await loadSiteData(); renderApp(); };
  $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); state.token = null; localStorage.removeItem('cms_token'); renderLogin(); };
  $('#newPage').onclick = newPage;
  $('#outboxBtn').onclick = showOutbox;

  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const sb = $('#sidebar');
  sb.replaceChildren(el(`<h3>Pages</h3>`));
  if (!state.pages.length) sb.append(el(`<div class="empty">No pages yet</div>`));
  for (const p of state.pages) {
    const item = el(`<div class="page-item ${p.id === state.pageId ? 'active' : ''}">
      <div class="row between"><strong>${esc(p.title)}</strong><span class="badge ${p.state}">${p.state.replace('_', ' ')}</span></div>
      <div class="slug">/${esc(p.slug)}</div>
    </div>`);
    item.onclick = async () => { state.pageId = p.id; await loadPage(); renderApp(); };
    sb.append(item);
  }
}

const TABS = [
  ['content', 'Content'],
  ['metadata', 'Metadata'],
  ['preview', 'Preview'],
  ['versions', 'Versions'],
  ['share', 'Share'],
  ['comments', 'Comments'],
  ['review', 'Review'],
];

function renderMain() {
  const main = $('#main');
  if (!state.page) return main.replaceChildren(el(`<div class="empty">Select or create a page to begin.</div>`));
  const p = state.page;
  main.replaceChildren(
    el(`<div class="row between">
      <div><h2>${esc(p.title)} <span class="badge ${p.state}">${p.state.replace('_', ' ')}</span></h2><div class="muted">/${esc(p.slug)} · v${p.currentVersion?.version ?? '?'}</div></div>
      <div class="row" id="stateActions"></div>
    </div>`),
  );
  renderStateActions();
  const tabs = el(`<div class="tabs"></div>`);
  for (const [key, label] of TABS) {
    const b = el(`<button class="tab ${state.tab === key ? 'active' : ''}">${label}</button>`);
    b.onclick = () => { state.tab = key; renderMain(); };
    tabs.append(b);
  }
  main.append(tabs);
  const body = el(`<div id="tabBody"></div>`);
  main.append(body);
  ({
    content: renderContentTab,
    metadata: renderMetadataTab,
    preview: renderPreviewTab,
    versions: renderVersionsTab,
    share: renderShareTab,
    comments: renderCommentsTab,
    review: renderReviewTab,
  })[state.tab](body);
}

const NEXT_STATES = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'draft'],
  approved: ['published', 'draft'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

function renderStateActions() {
  const box = $('#stateActions');
  for (const to of NEXT_STATES[state.page.state] ?? []) {
    const b = el(`<button class="small ${to === 'published' || to === 'approved' ? 'primary' : ''}">→ ${to.replace('_', ' ')}</button>`);
    b.onclick = async () => {
      try { await api(`/pages/${state.page.id}/transition`, { method: 'POST', body: { state: to } }); toast(`Moved to ${to}`); await refreshPage(); }
      catch (e) { toast(e.message, true); }
    };
    box.append(b);
  }
}

async function refreshPage() {
  await loadPage();
  const { pages } = await api(`/sites/${state.siteId}/pages`);
  state.pages = pages;
  renderApp();
}

// ---- Content tab (block/slot editor) ------------------------------------
function renderContentTab(root) {
  const slots = state.page.currentVersion.content.slots;
  const draft = structuredClone(slots);
  const container = el(`<div></div>`);
  function redraw() {
    container.replaceChildren();
    for (const slot of Object.keys(draft)) {
      const se = el(`<div class="slot-editor"><h4>${esc(slot)}</h4></div>`);
      draft[slot].forEach((inst, i) => se.append(instanceEditor(slot, inst, i, draft, redraw)));
      const add = el(`<div class="row"><select class="addWidget"></select><button class="small">+ Add</button></div>`);
      const sel = $('.addWidget', add);
      sel.replaceChildren(
        el(`<option value="">— widget —</option>`),
        ...state.widgets.map((w) => el(`<option value="w:${w.id}">${esc(w.name)} (${esc(w.type)})</option>`)),
        ...state.shared.map((s) => el(`<option value="s:${s.id}">shared: ${esc(s.key)}</option>`)),
      );
      $('button', add).onclick = () => {
        if (!sel.value) return;
        const [kind, id] = sel.value.split(':');
        if (kind === 'w') {
          const w = state.widgets.find((x) => x.id === id);
          draft[slot].push({ instanceId: `i${Date.now()}`, widgetId: w.id, type: w.type, props: defaultProps(w) });
        } else {
          draft[slot].push({ instanceId: `i${Date.now()}`, type: 'shared_ref', props: { sharedContentId: id } });
        }
        redraw();
      };
      se.append(add);
      container.append(se);
    }
  }
  redraw();
  root.replaceChildren(container);
  const save = el(`<button class="primary">Save (new version)</button>`);
  save.onclick = async () => {
    try {
      await api(`/pages/${state.page.id}`, { method: 'PATCH', body: { content: { slots: draft }, note: 'Content edit' } });
      toast('Saved new version'); await refreshPage();
    } catch (e) { toast(e.message, true); }
  };
  root.append(el(`<div style="margin-top:12px"></div>`), save);
}

function defaultProps(widget) {
  const props = {};
  for (const [f, def] of Object.entries(widget.schema ?? {})) props[f] = def.default ?? '';
  return props;
}

function instanceEditor(slot, inst, idx, draft, redraw) {
  const box = el(`<div class="inst"><div class="row between"><span class="pill">${esc(inst.type)}</span><button class="small danger">remove</button></div></div>`);
  $('button', box).onclick = () => { draft[slot].splice(idx, 1); redraw(); };
  if (inst.type === 'shared_ref') {
    const s = state.shared.find((x) => x.id === inst.props.sharedContentId);
    box.append(el(`<div class="muted">→ ${esc(s?.key ?? inst.props.sharedContentId)}</div>`));
    return box;
  }
  const widget = state.widgets.find((w) => w.id === inst.widgetId);
  const fields = Object.keys(widget?.schema ?? { html: {} });
  for (const f of fields) {
    box.append(el(`<label>${esc(f)}</label>`));
    const input = el(`<input value="${esc(inst.props?.[f] ?? '')}" />`);
    input.oninput = () => { inst.props = inst.props || {}; inst.props[f] = input.value; };
    box.append(input);
  }
  return box;
}

// ---- Metadata tab --------------------------------------------------------
function renderMetadataTab(root) {
  const v = state.page.currentVersion;
  const m = v.metadata ?? {};
  root.replaceChildren(
    el(`<div class="card">
      <label>Title</label><input id="m_title" value="${esc(v.title)}" />
      <label>Slug</label><input id="m_slug" value="${esc(v.slug)}" />
      <div class="grid2">
        <div><label>SEO title</label><input id="m_seo" value="${esc(m.seoTitle ?? '')}" /></div>
        <div><label>Canonical URL</label><input id="m_canon" value="${esc(m.canonical ?? '')}" /></div>
      </div>
      <label>Meta description</label><textarea id="m_desc" rows="2">${esc(m.description ?? '')}</textarea>
      <label>OpenGraph image URL</label><input id="m_og" value="${esc(m.ogImage ?? '')}" />
      <div style="margin-top:12px"><button class="primary" id="saveMeta">Save metadata</button></div>
    </div>`),
  );
  $('#saveMeta').onclick = async () => {
    try {
      await api(`/pages/${state.page.id}`, {
        method: 'PATCH',
        body: {
          title: $('#m_title').value,
          slug: $('#m_slug').value,
          metadata: { seoTitle: $('#m_seo').value, canonical: $('#m_canon').value, description: $('#m_desc').value, ogImage: $('#m_og').value },
          note: 'Metadata edit',
        },
      });
      toast('Metadata saved'); await refreshPage();
    } catch (e) { toast(e.message, true); }
  };
}

// ---- Preview tab ---------------------------------------------------------
function resolveClient(version) {
  const v = structuredClone(version);
  for (const slot of Object.keys(v.content.slots)) {
    v.content.slots[slot] = v.content.slots[slot].map((inst) => {
      if (inst.type === 'shared_ref') {
        const s = state.shared.find((x) => x.id === inst.props.sharedContentId);
        return { ...inst, resolved: s ? { data: s.data, type: s.type, revision: s.revision } : null };
      }
      return inst;
    });
  }
  return v;
}

function renderPreviewTab(root) {
  const bar = el(`<div class="device-bar"><span class="muted">Viewport:</span></div>`);
  for (const d of ['desktop', 'tablet', 'mobile']) {
    const b = el(`<button class="small ${state.device === d ? 'primary' : ''}">${d}</button>`);
    b.onclick = () => { state.device = d; renderPreviewTab(root); };
    bar.append(b);
  }
  const site = state.sites.find((s) => s.id === state.siteId);
  const frame = el(`<div class="preview-frame ${state.device}">${renderPage(resolveClient(state.page.currentVersion), site)}</div>`);
  root.replaceChildren(bar, frame);
}

// ---- Versions tab --------------------------------------------------------
async function renderVersionsTab(root) {
  root.replaceChildren(el(`<div class="muted">Loading…</div>`));
  const { versions } = await api(`/pages/${state.page.id}/versions`);
  const list = el(`<div></div>`);
  for (const v of versions) {
    const isCurrent = v.id === state.page.currentVersionId;
    const card = el(`<div class="card"><div class="row between">
      <div><strong>v${v.version}</strong> ${isCurrent ? '<span class="pill">current</span>' : ''} <span class="muted">${esc(v.note ?? '')}</span><div class="muted">${new Date(v.createdAt).toLocaleString()}</div></div>
      <div></div>
    </div></div>`);
    if (!isCurrent) {
      const b = el(`<button class="small">Restore</button>`);
      b.onclick = async () => { await api(`/pages/${state.page.id}/versions/${v.id}/restore`, { method: 'POST' }); toast(`Restored v${v.version}`); await refreshPage(); state.tab = 'versions'; renderMain(); };
      $('.row > div:last-child', card).append(b);
    }
    list.append(card);
  }
  root.replaceChildren(list);
}

// ---- Share tab -----------------------------------------------------------
async function renderShareTab(root) {
  root.replaceChildren(el(`<div class="muted">Loading…</div>`));
  const create = el(`<div class="card"><div class="row">
    <select id="expiry"><option value="1h">1 hour</option><option value="24h">24 hours</option><option value="7d" selected>7 days</option><option value="none">No expiry</option></select>
    <select id="scope"><option value="page">This page</option><option value="site">Full site</option></select>
    <button class="primary" id="mkLink">Create preview link</button>
  </div></div>`);
  const { links } = await api(`/pages/${state.page.id}/preview-links`);
  const analytics = await api(`/pages/${state.page.id}/analytics`);
  const list = el(`<div></div>`);
  list.append(el(`<div class="row" style="gap:18px"><span class="pill">Total shares: ${analytics.totalShares}</span><span class="pill">Active: ${analytics.activeLinks}</span><span class="pill">Open threads: ${analytics.openCommentThreads}</span></div>`));
  for (const l of links) {
    const stat = analytics.links.find((x) => x.id === l.id) ?? {};
    const card = el(`<div class="card"><div class="row between">
      <div style="min-width:0;flex:1">
        <div class="row"><span class="badge ${l.live ? 'published' : 'archived'}">${l.live ? 'active' : (l.revoked ? 'revoked' : 'expired')}</span>
        <a href="${esc(l.url)}" target="_blank" style="word-break:break-all">${esc(l.url)}</a></div>
        <div class="muted">${stat.views ?? 0} views · ${stat.uniqueViewers ?? 0} unique · expires ${l.expiresAt ? new Date(l.expiresAt).toLocaleString() : 'never'}</div>
      </div>
      <div class="row"><button class="small copy">Copy</button>${l.revoked ? '' : '<button class="small danger revoke">Revoke</button>'}</div>
    </div></div>`);
    $('.copy', card).onclick = () => { navigator.clipboard?.writeText(l.url); toast('Link copied'); };
    if ($('.revoke', card)) $('.revoke', card).onclick = async () => { await api(`/preview-links/${l.id}`, { method: 'DELETE' }); toast('Revoked'); renderShareTab(root); };
    list.append(card);
  }
  root.replaceChildren(create, list);
  $('#mkLink').onclick = async () => {
    try { await api(`/pages/${state.page.id}/preview-links`, { method: 'POST', body: { expiry: $('#expiry').value, scope: $('#scope').value } }); toast('Link created'); renderShareTab(root); }
    catch (e) { toast(e.message, true); }
  };
}

// ---- Comments tab --------------------------------------------------------
async function renderCommentsTab(root) {
  root.replaceChildren(el(`<div class="muted">Loading…</div>`));
  const { comments } = await api(`/pages/${state.page.id}/comments`);
  const add = el(`<div class="card"><label>New comment</label><textarea id="c_body" rows="2" placeholder="Use @email to mention a user"></textarea>
    <div class="row between" style="margin-top:8px"><select id="c_vis"><option value="internal">Internal</option><option value="external">External (visible to link recipients)</option></select><button class="primary" id="c_add">Comment</button></div></div>`);
  const list = el(`<div></div>`);
  if (!comments.length) list.append(el(`<div class="empty">No comments yet.</div>`));
  for (const c of comments) list.append(commentCard(c, root));
  root.replaceChildren(add, list);
  $('#c_add').onclick = async () => {
    const body = $('#c_body').value.trim();
    if (!body) return;
    try { await api(`/pages/${state.page.id}/comments`, { method: 'POST', body: { body, visibility: $('#c_vis').value } }); renderCommentsTab(root); }
    catch (e) { toast(e.message, true); }
  };
}

function commentCard(c, root) {
  const card = el(`<div class="card"><div class="comment ${c.state === 'resolved' ? 'resolved' : ''}">
    <div class="row between"><strong>${esc(c.authorName)}</strong><span class="badge ${c.state === 'resolved' ? 'published' : 'in_review'}">${esc(c.state)}</span></div>
    <div>${esc(c.body)}</div>
    <div class="meta">${esc(c.visibility)} · ${c.pin ? '📍 pinned' : ''} · ${new Date(c.createdAt).toLocaleString()} · ${(c.reactions ?? []).length} reactions</div>
  </div></div>`);
  const actions = el(`<div class="row" style="margin-top:6px"></div>`);
  for (const st of ['open', 'in_progress', 'resolved']) {
    if (st === c.state) continue;
    const b = el(`<button class="small">${st.replace('_', ' ')}</button>`);
    b.onclick = async () => { await api(`/comments/${c.id}/state`, { method: 'PATCH', body: { state: st } }); renderCommentsTab(root); };
    actions.append(b);
  }
  const like = el(`<button class="small">👍</button>`);
  like.onclick = async () => { await api(`/comments/${c.id}/reactions`, { method: 'POST', body: { emoji: '👍' } }); renderCommentsTab(root); };
  actions.append(like);
  const replyBtn = el(`<button class="small">Reply</button>`);
  replyBtn.onclick = async () => {
    const text = prompt('Reply:');
    if (text) { await api(`/pages/${state.page.id}/comments`, { method: 'POST', body: { body: text, parentId: c.id, visibility: c.visibility } }); renderCommentsTab(root); }
  };
  actions.append(replyBtn);
  card.append(actions);
  for (const r of c.replies ?? []) {
    card.append(el(`<div class="comment reply"><div class="row between"><strong>${esc(r.authorName)}</strong></div><div>${esc(r.body)}</div><div class="meta">${new Date(r.createdAt).toLocaleString()}</div></div>`));
  }
  return card;
}

// ---- Review tab ----------------------------------------------------------
async function renderReviewTab(root) {
  root.replaceChildren(el(`<div class="muted">Loading…</div>`));
  const { reviews } = await api(`/pages/${state.page.id}/reviews`);
  const reviewers = state.users.filter((u) => u.roles.some((r) => ['reviewer', 'editor', 'site_admin'].includes(r.role)));
  const req = el(`<div class="card"><h3>Request review</h3>
    <label>Reviewers</label><select id="rv_users" multiple size="${Math.min(5, Math.max(2, reviewers.length))}"></select>
    <label>Due date</label><input id="rv_due" type="date" />
    <div style="margin-top:10px"><button class="primary" id="rv_send">Send review request</button></div></div>`);
  $('#rv_users', req).replaceChildren(...reviewers.map((u) => el(`<option value="${u.id}">${esc(u.name)} (${esc(u.email)})</option>`)));
  const list = el(`<div></div>`);
  for (const rv of reviews) list.append(reviewCard(rv, root));
  root.replaceChildren(req, list);
  $('#rv_send').onclick = async () => {
    const ids = [...$('#rv_users').selectedOptions].map((o) => o.value);
    if (!ids.length) return toast('Pick at least one reviewer', true);
    try { await api(`/pages/${state.page.id}/reviews`, { method: 'POST', body: { reviewerIds: ids, dueDate: $('#rv_due').value || null } }); toast('Review requested'); await refreshPage(); state.tab = 'review'; renderMain(); }
    catch (e) { toast(e.message, true); }
  };
}

function reviewCard(rv, root) {
  const card = el(`<div class="card"><div class="row between"><strong>Review</strong><span class="badge ${rv.status === 'approved' ? 'published' : rv.status === 'rejected' ? 'draft' : 'in_review'}">${esc(rv.status)}</span></div>
    <div class="muted">Reviewers: ${rv.reviewerIds.map((id) => esc(state.users.find((u) => u.id === id)?.name ?? id)).join(', ')}${rv.dueDate ? ` · due ${rv.dueDate}` : ''}</div></div>`);
  for (const d of rv.decisions) {
    card.append(el(`<div class="comment"><strong>${esc(state.users.find((u) => u.id === d.reviewerId)?.name ?? d.reviewerId)}</strong> ${d.decision === 'approve' ? '✅ approved' : '❌ rejected'} ${d.comment ? `— ${esc(d.comment)}` : ''}<div class="meta">${new Date(d.at).toLocaleString()}</div></div>`));
  }
  const amReviewer = rv.status === 'pending' && rv.reviewerIds.includes(state.user.id);
  if (amReviewer) {
    const actions = el(`<div class="row" style="margin-top:8px"><button class="primary small ap">Approve</button><button class="small danger rj">Reject</button></div>`);
    $('.ap', actions).onclick = async () => { try { await api(`/reviews/${rv.id}/decision`, { method: 'POST', body: { decision: 'approve' } }); toast('Approved'); await refreshPage(); state.tab = 'review'; renderMain(); } catch (e) { toast(e.message, true); } };
    $('.rj', actions).onclick = async () => { const comment = prompt('Reason for rejection (required):'); if (!comment) return; try { await api(`/reviews/${rv.id}/decision`, { method: 'POST', body: { decision: 'reject', comment } }); toast('Rejected'); await refreshPage(); state.tab = 'review'; renderMain(); } catch (e) { toast(e.message, true); } };
    card.append(actions);
  }
  return card;
}

// ---- New page ------------------------------------------------------------
async function newPage() {
  const { templates } = await api(`/sites/${state.siteId}/templates`);
  if (!templates.length) return toast('Create a template first (none on this site).', true);
  const title = prompt('Page title:');
  if (!title) return;
  const tmpl = templates[0];
  try {
    const { page } = await api(`/sites/${state.siteId}/pages`, { method: 'POST', body: { title, templateId: tmpl.id } });
    state.pageId = page.id;
    await loadSiteData();
    renderApp();
    toast(`Created "${title}" from ${tmpl.name}`);
  } catch (e) { toast(e.message, true); }
}

// ---- Outbox modal --------------------------------------------------------
async function showOutbox() {
  const { messages } = await api('/outbox');
  const overlay = el(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:40;display:flex;align-items:center;justify-content:center" id="ovl"></div>`);
  const panel = el(`<div class="card" style="max-width:560px;width:90%;max-height:80vh;overflow:auto"><div class="row between"><h3>Notification outbox</h3><button class="small" id="ovlClose">Close</button></div></div>`);
  if (!messages.length) panel.append(el(`<div class="empty">No notifications sent yet.</div>`));
  for (const m of messages) panel.append(el(`<div class="card"><div class="row between"><strong>${esc(m.subject)}</strong><span class="pill">${esc(m.kind)}</span></div><div class="muted">to ${esc(m.to)} · ${new Date(m.createdAt).toLocaleString()}</div><div>${esc(m.body)}</div></div>`));
  overlay.append(panel);
  document.body.append(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  $('#ovlClose', panel).onclick = () => overlay.remove();
}

boot();
