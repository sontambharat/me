// Sitefinity-style visual page builder: a draggable widget toolbox, a live
// canvas with drop zones across page slots, reorderable widgets with insertion
// indicators, nested column layouts, and a contextual properties panel.
import { renderWidget } from '/renderer.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const newId = () => `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// Drag payload — kept in JS because dataTransfer can't hold functions and its
// data isn't readable during dragover (browser security).
let DRAG = null;

export function createVisualEditor({ state, api, toast, onSaved }) {
  let draft = structuredClone(state.page.currentVersion.content.slots);
  let selectedId = null;
  let railMode = 'toolbox';
  let dirty = false;
  let canvasEl, railEl, statusEl;

  // ---- tree helpers ------------------------------------------------------
  function locate(id, container = draft, trail = []) {
    // Search slots (object of arrays) or a plain array (layout column).
    const arrays = Array.isArray(container) ? [container] : Object.values(container);
    for (const arr of arrays) {
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst.instanceId === id) return { array: arr, index: i, inst };
        if (inst.type === 'layout') {
          for (const col of inst.props.cols) {
            const found = locate(id, col, trail);
            if (found) return found;
          }
        }
      }
    }
    return null;
  }

  function resolveContainer(desc) {
    if (desc.type === 'slot') return draft[desc.slot];
    const layout = locate(desc.layout);
    return layout?.inst.props.cols[desc.col] ?? null;
  }

  function instanceById(id) {
    return locate(id)?.inst ?? null;
  }

  // Resolve a shared_ref instance for live canvas preview.
  function resolveForPreview(inst) {
    if (inst.type === 'shared_ref') {
      const s = state.shared.find((x) => x.id === inst.props.sharedContentId);
      return { ...inst, resolved: s ? { data: s.data, type: s.type, revision: s.revision } : null };
    }
    return inst;
  }

  // ---- factories (palette → new instance) --------------------------------
  function widgetFactory(w) {
    const props = {};
    for (const [f, def] of Object.entries(w.schema ?? {})) props[f] = def.default ?? '';
    return () => ({ instanceId: newId(), widgetId: w.id, type: w.type, props });
  }
  function sharedFactory(s) {
    return () => ({ instanceId: newId(), type: 'shared_ref', props: { sharedContentId: s.id } });
  }
  function layoutFactory(n) {
    return () => ({ instanceId: newId(), type: 'layout', props: { cols: Array.from({ length: n }, () => []) } });
  }

  // ---- mutations ---------------------------------------------------------
  function markDirty() { dirty = true; if (statusEl) statusEl.textContent = '● unsaved changes'; }

  function dropInto(desc, index, payload, el) {
    const target = resolveContainer(desc);
    if (!target) return;
    if (payload.mode === 'new') {
      target.splice(index, 0, payload.factory());
    } else if (payload.mode === 'move') {
      // Never drop a layout into its own subtree.
      const movedEl = canvasEl.querySelector(`.cw[data-id="${payload.instanceId}"]`);
      if (movedEl && el && movedEl.contains(el)) return;
      const src = locate(payload.instanceId);
      if (!src) return;
      const fromSame = src.array === target;
      src.array.splice(src.index, 1);
      if (fromSame && src.index < index) index--;
      target.splice(index, 0, src.inst);
    }
    markDirty();
    renderCanvas();
  }

  function removeInstance(id) {
    const loc = locate(id);
    if (loc) { loc.array.splice(loc.index, 1); if (selectedId === id) selectedId = null; markDirty(); renderCanvas(); renderRail(); }
  }
  function duplicateInstance(id) {
    const loc = locate(id);
    if (!loc) return;
    const copy = structuredClone(loc.inst);
    reId(copy);
    loc.array.splice(loc.index + 1, 0, copy);
    markDirty(); renderCanvas();
  }
  function reId(inst) {
    inst.instanceId = newId();
    if (inst.type === 'layout') for (const col of inst.props.cols) for (const c of col) reId(c);
  }

  // ---- canvas rendering --------------------------------------------------
  function renderCanvas() {
    const order = ['header', 'hero', 'body', 'sidebar', 'footer'].filter((s) => draft[s]);
    const rest = Object.keys(draft).filter((s) => !order.includes(s));
    canvasEl.replaceChildren();
    for (const slot of [...order, ...rest]) {
      const section = el(`<div class="canvas-section"><div class="canvas-slot-label">${esc(slot)}</div></div>`);
      const zone = dropzone({ type: 'slot', slot });
      if (!draft[slot].length) zone.append(el(`<div class="dz-empty">Drag widgets here</div>`));
      for (const inst of draft[slot]) zone.append(renderInstance(inst));
      section.append(zone);
      canvasEl.append(section);
    }
  }

  function dropzone(desc) {
    const z = el(`<div class="dropzone"></div>`);
    z.dataset.desc = JSON.stringify(desc);
    return z;
  }

  function renderInstance(inst) {
    const w = el(`<div class="cw ${selectedId === inst.instanceId ? 'selected' : ''}" data-id="${inst.instanceId}"></div>`);
    const meta = state.widgets.find((x) => x.id === inst.widgetId);
    const label = inst.type === 'layout' ? `Layout · ${inst.props.cols.length} col` : (meta?.name ?? inst.type);
    const bar = el(`<div class="cw-bar">
      <span class="cw-handle" draggable="true" title="Drag to move">⋮⋮</span>
      <span class="cw-name">${esc(label)}</span>
      <span class="cw-actions">
        <button class="icon edit" title="Edit">✎</button>
        <button class="icon dup" title="Duplicate">⧉</button>
        <button class="icon del" title="Delete">🗑</button>
      </span>
    </div>`);
    w.append(bar);

    const handle = bar.querySelector('.cw-handle');
    handle.addEventListener('dragstart', (e) => { DRAG = { mode: 'move', instanceId: inst.instanceId }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', inst.instanceId); });
    handle.addEventListener('dragend', () => { DRAG = null; clearLines(); });
    bar.querySelector('.edit').onclick = (e) => { e.stopPropagation(); selectedId = inst.instanceId; railMode = 'props'; renderCanvas(); renderRail(); };
    bar.querySelector('.dup').onclick = (e) => { e.stopPropagation(); duplicateInstance(inst.instanceId); };
    bar.querySelector('.del').onclick = (e) => { e.stopPropagation(); removeInstance(inst.instanceId); };
    w.addEventListener('click', (e) => { e.stopPropagation(); selectedId = inst.instanceId; railMode = 'props'; renderCanvas(); renderRail(); });

    const body = el(`<div class="cw-body"></div>`);
    if (inst.type === 'layout') {
      const grid = el(`<div class="cw-layout" style="--cols:${inst.props.cols.length}"></div>`);
      inst.props.cols.forEach((children, ci) => {
        const colZone = dropzone({ type: 'col', layout: inst.instanceId, col: ci });
        colZone.classList.add('cw-col');
        if (!children.length) colZone.append(el(`<div class="dz-empty small">drop here</div>`));
        for (const child of children) colZone.append(renderInstance(child));
        grid.append(colZone);
      });
      body.append(grid);
    } else {
      body.innerHTML = `<div class="rendered-page">${renderWidget(resolveForPreview(inst))}</div>`;
    }
    w.append(body);
    return w;
  }

  // ---- drag-over insertion indicator -------------------------------------
  function clearLines() { canvasEl.querySelectorAll('.drop-line').forEach((l) => l.remove()); }

  function onDragOver(e) {
    const zone = e.target.closest('.dropzone');
    if (!zone || !DRAG) return;
    e.preventDefault();
    e.stopPropagation();
    const index = insertionIndex(zone, e.clientY);
    showLine(zone, index);
  }

  function directChildren(zone) {
    return [...zone.children].filter((c) => c.classList.contains('cw'));
  }
  function insertionIndex(zone, y) {
    const kids = directChildren(zone);
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return kids.length;
  }
  function showLine(zone, index) {
    clearLines();
    const line = el(`<div class="drop-line"></div>`);
    const kids = directChildren(zone);
    if (index >= kids.length) zone.append(line);
    else zone.insertBefore(line, kids[index]);
  }

  function onDrop(e) {
    const zone = e.target.closest('.dropzone');
    if (!zone || !DRAG) return clearLines();
    e.preventDefault();
    e.stopPropagation();
    const desc = JSON.parse(zone.dataset.desc);
    const index = insertionIndex(zone, e.clientY);
    const payload = DRAG;
    DRAG = null;
    clearLines();
    dropInto(desc, index, payload, zone);
  }

  // ---- right rail: toolbox + properties ----------------------------------
  function renderRail() {
    railEl.replaceChildren();
    const tabs = el(`<div class="rail-tabs">
      <button class="rail-tab ${railMode === 'toolbox' ? 'active' : ''}" data-m="toolbox">Toolbox</button>
      <button class="rail-tab ${railMode === 'props' ? 'active' : ''}" data-m="props">Properties</button>
    </div>`);
    tabs.querySelectorAll('.rail-tab').forEach((b) => (b.onclick = () => { railMode = b.dataset.m; renderRail(); }));
    railEl.append(tabs);
    const body = el(`<div class="rail-body"></div>`);
    railEl.append(body);
    railMode === 'toolbox' ? renderToolbox(body) : renderProps(body);
  }

  function paletteItem(label, sub, factory) {
    const item = el(`<div class="palette-item" draggable="true"><div class="pi-name">${esc(label)}</div>${sub ? `<div class="pi-sub">${esc(sub)}</div>` : ''}</div>`);
    item.addEventListener('dragstart', (e) => { DRAG = { mode: 'new', factory }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', label); });
    item.addEventListener('dragend', () => { DRAG = null; clearLines(); });
    // Click-to-add: drops into the first slot for quick building / accessibility.
    item.addEventListener('click', () => {
      const target = draft.body ? 'body' : Object.keys(draft)[0];
      draft[target].push(factory());
      markDirty(); renderCanvas();
      toast(`Added ${label} to ${target}`);
    });
    return item;
  }

  function renderToolbox(root) {
    root.append(el(`<div class="palette-group-title">Layout</div>`));
    const layouts = el(`<div class="palette-grid"></div>`);
    [['1 column', 1], ['2 columns', 2], ['3 columns', 3]].forEach(([lbl, n]) => layouts.append(paletteItem(lbl, 'container', layoutFactory(n))));
    root.append(layouts);

    const byCat = {};
    for (const w of state.widgets) (byCat[w.category] ??= []).push(w);
    for (const cat of Object.keys(byCat).sort()) {
      root.append(el(`<div class="palette-group-title">${esc(cat)}</div>`));
      const grid = el(`<div class="palette-grid"></div>`);
      for (const w of byCat[cat]) grid.append(paletteItem(w.name, w.type, widgetFactory(w)));
      root.append(grid);
    }
    if (state.shared.length) {
      root.append(el(`<div class="palette-group-title">Shared content</div>`));
      const grid = el(`<div class="palette-grid"></div>`);
      for (const s of state.shared) grid.append(paletteItem(s.key, 'shared', sharedFactory(s)));
      root.append(grid);
    }
    root.append(el(`<p class="hint">Drag onto the canvas, or click to add. Use the ⋮⋮ handle to move and reorder.</p>`));
  }

  function renderProps(root) {
    if (!selectedId) return root.append(el(`<div class="empty">Select a widget to edit its properties.</div>`));
    const inst = instanceById(selectedId);
    if (!inst) { selectedId = null; return root.append(el(`<div class="empty">Nothing selected.</div>`)); }

    if (inst.type === 'layout') {
      root.append(el(`<label>Columns</label>`));
      const row = el(`<div class="row"></div>`);
      [1, 2, 3, 4].forEach((n) => {
        const b = el(`<button class="small ${inst.props.cols.length === n ? 'primary' : ''}">${n}</button>`);
        b.onclick = () => { setColumns(inst, n); renderCanvas(); renderRail(); };
        row.append(b);
      });
      root.append(row);
      root.append(el(`<p class="hint">Reducing columns moves widgets from removed columns into the last one.</p>`));
      return;
    }
    if (inst.type === 'shared_ref') {
      root.append(el(`<label>Shared content</label>`));
      const sel = el(`<select></select>`);
      sel.replaceChildren(...state.shared.map((s) => el(`<option value="${s.id}" ${s.id === inst.props.sharedContentId ? 'selected' : ''}>${esc(s.key)}</option>`)));
      sel.onchange = () => { inst.props.sharedContentId = sel.value; markDirty(); renderCanvas(); };
      root.append(sel);
      return;
    }
    const meta = state.widgets.find((x) => x.id === inst.widgetId);
    const fields = Object.entries(meta?.schema ?? { html: { type: 'string' } });
    root.append(el(`<div class="muted" style="margin-bottom:8px">${esc(meta?.name ?? inst.type)}</div>`));
    for (const [f, def] of fields) {
      root.append(el(`<label>${esc(f)}${def.required ? ' *' : ''}</label>`));
      const long = f === 'html' || f === 'quote' || /text|body|description/.test(f);
      const input = long
        ? el(`<textarea rows="4">${esc(inst.props?.[f] ?? '')}</textarea>`)
        : el(`<input value="${esc(inst.props?.[f] ?? '')}" />`);
      input.oninput = () => { inst.props = inst.props || {}; inst.props[f] = input.value; markDirty(); renderCanvasWidget(inst.instanceId); };
      root.append(input);
    }
  }

  // Re-render only one widget's body so the properties inputs keep focus.
  function renderCanvasWidget(id) {
    const w = canvasEl.querySelector(`.cw[data-id="${id}"] > .cw-body`);
    const inst = instanceById(id);
    if (w && inst && inst.type !== 'layout') w.innerHTML = `<div class="rendered-page">${renderWidget(resolveForPreview(inst))}</div>`;
  }

  function setColumns(inst, n) {
    const cols = inst.props.cols;
    if (n < cols.length) {
      const extra = cols.splice(n).flat();
      cols[n - 1].push(...extra);
    } else {
      while (cols.length < n) cols.push([]);
    }
    markDirty();
  }

  // ---- save --------------------------------------------------------------
  async function save() {
    try {
      await api(`/pages/${state.page.id}`, { method: 'PATCH', body: { content: { slots: draft }, note: 'Visual editor' } });
      dirty = false;
      statusEl.textContent = 'Saved';
      toast('Saved new version');
      onSaved?.();
    } catch (e) { toast(e.message, true); }
  }

  // ---- mount -------------------------------------------------------------
  return function render(root) {
    const shell = el(`<div class="editor">
      <div class="editor-canvas-wrap"><div class="editor-canvas" id="ed-canvas"></div></div>
      <aside class="editor-rail" id="ed-rail"></aside>
    </div>`);
    const footer = el(`<div class="editor-footer"><span class="muted" id="ed-status">${dirty ? '● unsaved changes' : 'No changes'}</span><button class="primary" id="ed-save">Save (new version)</button></div>`);
    root.replaceChildren(shell, footer);
    canvasEl = shell.querySelector('#ed-canvas');
    railEl = shell.querySelector('#ed-rail');
    statusEl = footer.querySelector('#ed-status');
    canvasEl.addEventListener('dragover', onDragOver);
    canvasEl.addEventListener('drop', onDrop);
    canvasEl.addEventListener('dragleave', (e) => { if (!canvasEl.contains(e.relatedTarget)) clearLines(); });
    canvasEl.addEventListener('click', () => { selectedId = null; renderCanvas(); renderRail(); });
    footer.querySelector('#ed-save').onclick = save;
    renderCanvas();
    renderRail();
  };
}
