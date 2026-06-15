// Shared widget renderer used by both the in-CMS live preview and the public
// preview page, so what a reviewer sees matches what an editor sees.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderWidget(inst) {
  const id = inst.instanceId;
  const wrap = (inner) => `<div class="widget" data-instance="${id}" data-type="${esc(inst.type)}">${inner}</div>`;
  switch (inst.type) {
    case 'hero': {
      const p = inst.props ?? {};
      return wrap(`
        <section class="w-hero">
          <h1>${esc(p.heading)}</h1>
          ${p.subheading ? `<p class="sub">${esc(p.subheading)}</p>` : ''}
          ${p.ctaLabel ? `<a class="w-cta-btn" href="${esc(p.ctaUrl || '#')}">${esc(p.ctaLabel)}</a>` : ''}
        </section>`);
    }
    case 'richtext':
      return wrap(`<div class="w-richtext">${inst.props?.html ?? ''}</div>`);
    case 'cta': {
      const p = inst.props ?? {};
      return wrap(`<a class="w-cta-btn" href="${esc(p.url || '#')}">${esc(p.label)}</a>`);
    }
    case 'shared_ref': {
      const r = inst.resolved;
      if (!r) return wrap(`<div class="w-shared missing">⚠ shared content not found</div>`);
      const inner = r.type === 'richtext' ? (r.data?.html ?? '') : `<pre>${esc(JSON.stringify(r.data, null, 2))}</pre>`;
      return wrap(`<div class="w-shared">${inner}</div>`);
    }
    default:
      return wrap(`<div class="w-unknown">[${esc(inst.type)}]</div>`);
  }
}

export function renderPage(version, site) {
  const slots = version?.content?.slots ?? {};
  const order = ['header', 'hero', 'body', 'sidebar', 'footer'].filter((s) => slots[s]);
  const extra = Object.keys(slots).filter((s) => !order.includes(s));
  const allSlots = [...order, ...extra];
  const theme = site?.theme ?? {};
  const accent = theme.accent ?? '#2563eb';
  const body = allSlots
    .map((slot) => {
      const items = (slots[slot] ?? []).map(renderWidget).join('');
      return `<div class="slot slot-${esc(slot)}" data-slot="${esc(slot)}">${items || `<div class="slot-empty">${esc(slot)} (empty)</div>`}</div>`;
    })
    .join('');
  return `<div class="rendered-page" style="--accent:${esc(accent)}">${body}</div>`;
}
