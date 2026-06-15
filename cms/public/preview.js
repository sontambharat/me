import { renderPage } from '/renderer.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const token = new URLSearchParams(location.search).get('token');
let data = null;
let device = 'desktop';
let annotate = false;
let pendingPin = null;
const guestName = localStorage.getItem('pv_name') || '';

function toast(msg, err) {
  const t = el(`<div class="toast ${err ? 'error' : ''}">${esc(msg)}</div>`);
  $('#toast').append(t);
  setTimeout(() => t.remove(), 3000);
}

async function load() {
  if (!token) return ($('#pv').innerHTML = '<div class="empty">Missing preview token.</div>');
  try {
    const session = sessionStorage.getItem('pv_session') || '';
    const res = await fetch(`/api/preview/${encodeURIComponent(token)}${session ? `?session=${session}` : ''}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Preview unavailable');
    data = body;
    sessionStorage.setItem('pv_session', data.session);
    render();
  } catch (e) {
    $('#pv').replaceChildren(el(`<div class="login"><div class="card"><h2>Preview unavailable</h2><p class="muted">${esc(e.message)}</p></div></div>`));
  }
}

function render() {
  const wrap = el(`<div class="pv-wrap">
    <div class="pv-stage">
      <div class="device-bar">
        <strong>${esc(data.page.title)}</strong>
        <span class="badge ${data.page.state}">${data.page.state.replace('_', ' ')}</span>
        <span class="spacer" style="flex:1"></span>
        <button class="small" data-d="desktop">desktop</button>
        <button class="small" data-d="tablet">tablet</button>
        <button class="small" data-d="mobile">mobile</button>
        <button class="small" id="annoBtn">📍 ${annotate ? 'annotating…' : 'annotate'}</button>
      </div>
      <div class="preview-frame ${device}" style="margin:0 auto">
        <div class="pv-canvas ${annotate ? 'annotate-on' : ''}" id="canvas">${renderPage(data.version, data.site)}</div>
      </div>
    </div>
    <aside class="pv-side" id="side"></aside>
  </div>`);
  $('#pv').replaceChildren(wrap);
  for (const b of wrap.querySelectorAll('[data-d]')) b.onclick = () => { device = b.dataset.d; render(); };
  $('#annoBtn').onclick = () => { annotate = !annotate; render(); };

  const canvas = $('#canvas');
  drawPins(canvas);
  if (annotate) {
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const inst = e.target.closest('[data-instance]');
      pendingPin = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        selector: inst ? inst.dataset.instance : null,
      };
      renderSide();
    };
  }
  renderSide();
}

function drawPins(canvas) {
  const pinned = data.comments.filter((c) => c.pin);
  pinned.forEach((c, i) => {
    const dot = el(`<div class="pin" title="${esc(c.body)}">${i + 1}</div>`);
    dot.style.left = `${(c.pin.x ?? 0) * 100}%`;
    dot.style.top = `${(c.pin.y ?? 0) * 100}%`;
    canvas.append(dot);
  });
}

function renderSide() {
  const side = $('#side');
  side.replaceChildren(el(`<h3>Feedback</h3>`), el(`<div class="muted" style="margin-bottom:10px">Click <em>annotate</em>, then click the page to pin a comment.</div>`));

  const form = el(`<div class="card">
    ${pendingPin ? `<div class="pill">📍 pin set${pendingPin.selector ? ` on ${esc(pendingPin.selector)}` : ''}</div>` : ''}
    <label>Your name</label><input id="g_name" value="${esc(guestName)}" />
    <label>Comment</label><textarea id="g_body" rows="3"></textarea>
    <div class="row between" style="margin-top:8px">
      ${pendingPin ? '<button class="small" id="g_clear">clear pin</button>' : '<span></span>'}
      <button class="primary" id="g_send">Send</button>
    </div>
  </div>`);
  side.append(form);
  if (pendingPin) $('#g_clear', form).onclick = () => { pendingPin = null; renderSide(); };
  $('#g_send', form).onclick = submitComment;

  const list = el(`<div></div>`);
  const pinned = data.comments.filter((c) => c.pin);
  if (!data.comments.length) list.append(el(`<div class="empty">No feedback yet.</div>`));
  data.comments.forEach((c) => {
    const n = c.pin ? pinned.indexOf(c) + 1 : null;
    const card = el(`<div class="card"><div class="comment ${c.state === 'resolved' ? 'resolved' : ''}">
      <div class="row between"><strong>${n ? `${n}. ` : ''}${esc(c.authorName)}</strong><span class="badge ${c.state === 'resolved' ? 'published' : 'in_review'}">${esc(c.state)}</span></div>
      <div>${esc(c.body)}</div>
      <div class="meta">${new Date(c.createdAt).toLocaleString()}</div>
    </div></div>`);
    for (const r of c.replies ?? []) card.append(el(`<div class="comment reply"><strong>${esc(r.authorName)}</strong><div>${esc(r.body)}</div></div>`));
    list.append(card);
  });
  side.append(list);
}

async function submitComment() {
  const name = $('#g_name').value.trim();
  const body = $('#g_body').value.trim();
  if (!name || !body) return toast('Name and comment are required', true);
  localStorage.setItem('pv_name', name);
  try {
    const res = await fetch(`/api/preview/${encodeURIComponent(token)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, body, pin: pendingPin, pageId: data.page.id }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    pendingPin = null;
    toast('Comment sent');
    await load();
  } catch (e) {
    toast(e.message, true);
  }
}

load();
