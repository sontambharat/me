// Shared widget renderer used by both the in-CMS live preview and the public
// preview page, so what a reviewer sees matches what an editor sees.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderWidget(inst) {
  const id = inst.instanceId;
  const wrap = (inner) => `<div class="widget" data-instance="${id}" data-type="${esc(inst.type)}">${inner}</div>`;
  const p = inst.props ?? {};
  switch (inst.type) {
    case 'hero':
      return wrap(`
        <section class="w-hero">
          <h1>${esc(p.heading)}</h1>
          ${p.subheading ? `<p class="sub">${esc(p.subheading)}</p>` : ''}
          ${p.ctaLabel ? `<a class="w-cta-btn" href="${esc(p.ctaUrl || '#')}">${esc(p.ctaLabel)}</a>` : ''}
        </section>`);
    case 'richtext':
      return wrap(`<div class="w-richtext">${p.html ?? ''}</div>`);
    case 'cta':
      return wrap(`<a class="w-cta-btn" href="${esc(p.url || '#')}">${esc(p.label)}</a>`);
    case 'image':
      return wrap(`<figure class="w-image">
        ${p.src ? `<img src="${esc(p.src)}" alt="${esc(p.alt)}" />` : `<div class="w-image-ph">image</div>`}
        ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
      </figure>`);
    case 'testimonial':
      return wrap(`<blockquote class="w-testimonial">
        <p>${esc(p.quote)}</p>
        <cite>${esc(p.author)}${p.role ? `, ${esc(p.role)}` : ''}</cite>
      </blockquote>`);
    case 'layout': {
      const cols = p.cols ?? [];
      const inner = cols
        .map((children) => `<div class="w-col">${(children ?? []).map(renderWidget).join('') || ''}</div>`)
        .join('');
      return wrap(`<div class="w-layout" style="--cols:${cols.length || 1}">${inner}</div>`);
    }
    case 'shared_ref': {
      const r = inst.resolved;
      if (!r) return wrap(`<div class="w-shared missing">⚠ shared content not found</div>`);
      const body = r.type === 'richtext' ? (r.data?.html ?? '') : `<pre>${esc(JSON.stringify(r.data, null, 2))}</pre>`;
      return wrap(`<div class="w-shared">${body}</div>`);
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
