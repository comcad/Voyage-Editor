/**
 * A node board: boxes (nodes) on a board you drag about, pan and zoom, with wires from one node's ways out (the dots
 * on its right) to another's ways in (on its left). What the nodes are and what a wire means belongs to whoever uses
 * it: `types` says how each kind of node looks and which wires it takes, and every change is handed back (onMove,
 * onConnect, onDisconnect, onDelete, onAdd, onSelect) to be made to what is being edited, which then shows the
 * board again (show) with things as they are now.
 *
 *   types[type] = { label, color, ins: [{ name, label, accepts: [kind...] }], outs: (node) => [{ name, label, kind }],
 *                   body: (node) => what the node shows, deletable: true or false }
 *   a graph     = { nodes: [{ id, type, x, y, title, data }], wires: [{ from: [id, out], to: [id, in], fixed }] }
 */
import { h, svg, fill } from './ui.js';

const MIN_ZOOM = 0.25, MAX_ZOOM = 2;
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function nodeBoard({ types, addable = [], onSelect, onWire, onMove, onConnect, onDisconnect, onDelete, onAdd }) {
  let graph = { nodes: [], wires: [] }, picked = null, pickedWire = null, view = { x: 40, y: 40, k: 1 }, fitted = false;
  const els = new Map();   // node id -> its element
  const world = h('div', { class: 'nb-world' }), wires = svg('svg', { class: 'nb-wires', width: 1, height: 1 });
  const menu = h('div', { class: 'nb-menu', hidden: true, role: 'menu' });
  const zoomLabel = h('span', { class: 'nb-zoom' });
  const bar = h('div', { class: 'nb-bar' },
    addable.length ? h('button', { type: 'button', onclick: (e) => { const r = el.getBoundingClientRect(); openMenu(r.width / 2, r.height / 2, e.currentTarget); } }, 'Add ▾') : null,
    h('button', { type: 'button', title: 'Everything in view (F)', onclick: () => fit() }, 'Fit'),
    h('button', { type: 'button', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomAt(null, 1 / 1.2) }, '−'),
    h('button', { type: 'button', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomAt(null, 1.2) }, '+'), zoomLabel);
  world.append(wires);
  const el = h('div', { class: 'nb', tabindex: 0, 'aria-label': 'Node board: drag a node to move it, drag from a dot on its right to wire it, drag the board to move about, the wheel to zoom.' }, world, bar, menu);

  const place = () => { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; zoomLabel.textContent = `${Math.round(view.k * 100)}%`; };
  /** A point on the screen as a point on the board. */
  const toBoard = (cx, cy) => { const r = el.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
  /** Where a port's dot is, on the board. */
  function portAt(id, dir, name) {
    const dot = els.get(id)?.querySelector(`.nb-port.${dir}[data-port="${CSS.escape(name)}"]`);
    if (!dot) return null;
    const r = dot.getBoundingClientRect();
    return toBoard(r.left + r.width / 2, r.top + r.height / 2);
  }
  const curve = (a, b) => { const d = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`; };
  function drawWires() {
    fill(wires);
    graph.wires.forEach((w, i) => {
      const a = portAt(w.from[0], 'out', w.from[1]), b = portAt(w.to[0], 'in', w.to[1]);
      if (!a || !b) return;
      const d = curve(a, b), on = pickedWire === i;
      wires.append(svg('path', { d, class: `nb-wire-hit${w.fixed ? ' fixed' : ''}`, 'data-wire': i }), svg('path', { d, class: `nb-wire${w.fixed ? ' fixed' : ''}${on ? ' on' : ''}` }));
    });
  }

  function nodeEl(n) {
    const t = types[n.type] || {}, outs = t.outs ? t.outs(n) : [];
    const port = (dir, p) => h('div', { class: `nb-row ${dir}` }, dir === 'in' ? h('span', { class: 'nb-port in', 'data-port': p.name, 'data-node': n.id, title: p.label || p.name }) : null,
      h('span', { class: 'nb-port-name' }, p.label ?? ''), dir === 'out' ? h('span', { class: 'nb-port out', 'data-port': p.name, 'data-node': n.id, 'data-kind': p.kind, title: p.label || p.name }) : null);
    const node = h('div', { class: `nb-node${picked === n.id ? ' on' : ''}`, 'data-node': n.id, style: { left: `${n.x}px`, top: `${n.y}px`, '--nb-color': t.color || 'var(--accent)' } },
      h('div', { class: 'nb-head', 'data-node': n.id }, h('span', { class: 'nb-kind' }, t.label || n.type), h('span', { class: 'nb-title' }, n.title ?? '')),
      h('div', { class: 'nb-ports' }, h('div', { class: 'nb-ins' }, (t.ins || []).map((p) => port('in', p))), h('div', { class: 'nb-outs' }, outs.map((p) => port('out', p)))),
      t.body ? h('div', { class: 'nb-body' }, t.body(n)) : null);
    return node;
  }

  /** Shows a graph (keeping where the board is looked at). */
  function show(next) {
    graph = next;
    if (picked && !graph.nodes.some((n) => n.id === picked)) picked = null;
    pickedWire = null;
    for (const e of els.values()) e.remove();
    els.clear();
    for (const n of graph.nodes) { const e = nodeEl(n); els.set(n.id, e); world.append(e); }
    place();
    // (the first time: as much as fits at a size that can be read, from the top left; Fit shows it all)
    requestAnimationFrame(() => { unstack(); if (!fitted && graph.nodes.length) { fitted = true; fit(0.75); } else drawWires(); });
  }
  /** Nodes in one column that would lie over each other (a tall one above another) are moved apart, down. */
  function unstack() {
    const cols = new Map();
    for (const n of graph.nodes) { if (!cols.has(n.x)) cols.set(n.x, []); cols.get(n.x).push(n); }
    for (const col of cols.values()) {
      col.sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) {
        const above = col[i - 1], low = above.y + (els.get(above.id)?.offsetHeight || 0) + 16;
        if (col[i].y < low) { col[i].y = low; const e = els.get(col[i].id); if (e) e.style.top = `${low}px`; }
      }
    }
  }
  /** Draws one node again (its title or what it shows changed), leaving the rest. */
  function redraw(id) {
    const n = graph.nodes.find((x) => x.id === id), old = els.get(id);
    if (!n || !old) return;
    const e = nodeEl(n);
    old.replaceWith(e); els.set(id, e);
    drawWires();
  }
  function select(id, tell = true) {
    picked = id; pickedWire = null;
    for (const [nid, e] of els) e.classList.toggle('on', nid === id);
    drawWires();
    if (tell) onSelect?.(id);
  }
  /** Everything in view, or (with `least`) at that zoom at the least, from the top left when it doesn't all fit. */
  function fit(least = MIN_ZOOM) {
    if (!graph.nodes.length) return;
    const r = el.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of graph.nodes) { const e = els.get(n.id); x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + (e?.offsetWidth || 200)); y1 = Math.max(y1, n.y + (e?.offsetHeight || 100)); }
    const all = Math.min((r.width - 60) / (x1 - x0 || 1), (r.height - 90) / (y1 - y0 || 1), 1), k = Math.min(MAX_ZOOM, Math.max(least, MIN_ZOOM, all));
    view = k > all ? { k, x: 30 - x0 * k, y: 56 - y0 * k } : { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: 50 + (r.height - 50 - (y1 - y0) * k) / 2 - y0 * k };
    place(); drawWires();
  }
  function zoomAt(e, by) {
    const r = el.getBoundingClientRect(), cx = e ? e.clientX - r.left : r.width / 2, cy = e ? e.clientY - r.top : r.height / 2;
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * by));
    view = { k, x: cx - ((cx - view.x) * k) / view.k, y: cy - ((cy - view.y) * k) / view.k };
    place(); drawWires();
  }
  /** A point on the board no node covers, from `at` stepping right and down. */
  function freeSpot(at) {
    const covers = (p) => graph.nodes.some((n) => { const e = els.get(n.id); return p.x >= n.x - 20 && p.x <= n.x + (e?.offsetWidth || 200) + 20 && p.y >= n.y - 20 && p.y <= n.y + (e?.offsetHeight || 100) + 20; });
    const p = { ...at };
    for (let i = 0; i < 40 && covers(p); i++) { p.x += 120; if (i % 4 === 3) { p.x = at.x; p.y += 140; } }
    return p;
  }
  function openMenu(x, y, anchor = null) {
    const at = freeSpot(toBoard(el.getBoundingClientRect().left + x, el.getBoundingClientRect().top + y));
    fill(menu, h('p', { class: 'muted' }, 'Add'), addable.map((a) => h('button', { type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; onAdd?.(a.type, Math.round(at.x), Math.round(at.y)); } }, a.label)));
    menu.style.left = `${anchor ? anchor.offsetLeft : x}px`; menu.style.top = `${anchor ? anchor.offsetTop + anchor.offsetHeight + 4 : y}px`;
    menu.hidden = false;
  }

  // ---------------------------------------------------------------- the mouse (and fingers)
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.nb-bar, .nb-menu')) return;
    menu.hidden = true;
    const out = e.target.closest('.nb-port.out'), node = e.target.closest('.nb-node'), wire = e.target.closest('.nb-wire-hit');
    if (node && !out && e.target.closest('button, input, select, textarea, a, summary')) return;   // (what is in a node works as it is)
    if (out) {
      const from = [out.dataset.node, out.dataset.port], a = portAt(...from.slice(0, 1), 'out', from[1]);
      const temp = svg('path', { class: 'nb-wire temp', d: curve(a, a) });
      wires.append(temp);
      drag = { kind: 'wire', from, kindOf: out.dataset.kind, a, temp };
    } else if (node) {
      // a node is picked as it is pressed, and moves with the pointer from anywhere on it
      const n = graph.nodes.find((x) => x.id === node.dataset.node);
      if (!n) return;
      if (picked !== n.id) select(n.id);
      el.focus({ preventScroll: true });
      drag = { kind: 'node', n, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y, moved: false };
      node.classList.add('dragging');
    } else if (wire) {
      pickedWire = Number(wire.dataset.wire); picked = null;
      for (const x of els.values()) x.classList.remove('on');
      drawWires(); el.focus();
      if (onWire) onWire(graph.wires[pickedWire]); else onSelect?.(null);
      return;
    }
    else drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  /**
   * The way in a wire being drawn would go into, let go of here: the one under the pointer, else the nearest one that
   * takes it within a few pixels (so a small dot on a board zoomed out can still be hit).
   */
  function intoAt(cx, cy, kind, from) {
    const under = document.elementFromPoint(cx, cy)?.closest('.nb-port.in');
    if (under && accepts(under, kind) && under.dataset.node !== from) return under;
    let best = null, bd = 24 * 24;
    for (const p of el.querySelectorAll('.nb-port.in')) {
      if (p.dataset.node === from || !accepts(p, kind)) continue;
      const r = p.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'wire') {
      drag.temp.setAttribute('d', curve(drag.a, toBoard(e.clientX, e.clientY)));
      const into = intoAt(e.clientX, e.clientY, drag.kindOf, drag.from[0]);
      for (const p of el.querySelectorAll('.nb-port.in.can')) if (p !== into) p.classList.remove('can');
      if (into && accepts(into, drag.kindOf)) into.classList.add('can');
    } else if (drag.kind === 'node') {
      const dx = (e.clientX - drag.sx) / view.k, dy = (e.clientY - drag.sy) / view.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.n.x = Math.round(drag.x + dx); drag.n.y = Math.round(drag.y + dy);
      const ne = els.get(drag.n.id);
      ne.style.left = `${drag.n.x}px`; ne.style.top = `${drag.n.y}px`;
      drawWires();
    } else {
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
      view.x = drag.x + e.clientX - drag.sx; view.y = drag.y + e.clientY - drag.sy;
      place();
    }
  });
  const accepts = (port, kind) => {
    const n = graph.nodes.find((x) => x.id === port.dataset.node), p = (types[n?.type]?.ins || []).find((x) => x.name === port.dataset.port);
    return !!p && (p.accepts || []).includes(kind);
  };
  el.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind === 'wire') {
      d.temp.remove();
      for (const p of el.querySelectorAll('.nb-port.in.can')) p.classList.remove('can');
      const into = intoAt(e.clientX, e.clientY, d.kindOf, d.from[0]);
      if (into) onConnect?.({ from: d.from, to: [into.dataset.node, into.dataset.port] });
    } else if (d.kind === 'node') {
      els.get(d.n.id)?.classList.remove('dragging');
      if (d.moved) onMove?.(d.n.id, d.n.x, d.n.y);
    } else if (!d.moved) { select(null); }
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e, e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  el.addEventListener('contextmenu', (e) => {
    if (!addable.length || e.target.closest('.nb-node, .nb-bar')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    openMenu(e.clientX - r.left, e.clientY - r.top);
  });
  el.addEventListener('keydown', (e) => {
    if (isTyping(document.activeElement)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (pickedWire !== null) { const w = graph.wires[pickedWire]; if (w && !w.fixed) { e.preventDefault(); onDisconnect?.(w); } }
      else if (picked) { const n = graph.nodes.find((x) => x.id === picked); if (n && types[n.type]?.deletable) { e.preventDefault(); onDelete?.(n.id); } }
    } else if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === 'Escape') menu.hidden = true;
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !e.target.closest?.('.nb-bar')) menu.hidden = true; });
  new ResizeObserver(() => drawWires()).observe(el);

  return {
    el, show, redraw, select, fit,
    /** The kind of node a node is. */
    typeOf: (id) => graph.nodes.find((n) => n.id === id)?.type ?? null,
    /** Lets go of the wire picked (it was cut). */
    unpickWire() { pickedWire = null; drawWires(); },
    /** The wire picked (or null), for a button that takes it off. */
    get pickedWire() { return pickedWire === null ? null : graph.wires[pickedWire] || null; },
    get picked() { return picked; },
    /** Forget where the board was looked at, so the next graph shown is fitted to the view. */
    refit() { fitted = false; },
  };
}

/**
 * Places nodes that have no place yet: each in a column by how far it is from the first (along the wires), one under
 * another. `kept` holds the places nodes were given before ({ id: [x, y] }).
 */
export function arrange(graph, kept = {}) {
  const depth = new Map(), first = graph.nodes[0]?.id;
  if (first) depth.set(first, 0);
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const w of graph.wires) {
      const a = depth.get(w.from[0]);
      if (a !== undefined && (depth.get(w.to[0]) === undefined || depth.get(w.to[0]) > a + 1) && w.to[0] !== first) { depth.set(w.to[0], a + 1); changed = true; }
    }
    if (!changed) break;
  }
  // a column of more than PER nodes goes on in more columns beside it (so a long one can still be read when fitted)
  const PER = 5, count = new Map(), seen = new Map();
  for (const n of graph.nodes) { const col = depth.get(n.id) ?? 0; count.set(col, (count.get(col) || 0) + 1); }
  const offset = new Map();
  let x = 0;
  for (const col of [...count.keys()].sort((a, b) => a - b)) { offset.set(col, x); x += Math.ceil(count.get(col) / PER); }
  for (const n of graph.nodes) {
    const at = kept[n.id];
    if (Array.isArray(at)) { n.x = at[0]; n.y = at[1]; continue; }
    const col = depth.get(n.id) ?? 0, i = seen.get(col) || 0;
    seen.set(col, i + 1);
    n.x = (offset.get(col) + Math.floor(i / PER)) * 290; n.y = (i % PER) * 175;
  }
  return graph;
}
