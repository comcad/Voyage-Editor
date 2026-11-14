/**
 * Pictures changed in the editor, live: painted on pixel by pixel, turned, flipped and moved.
 *
 * A picture being changed is an edit: the picture as it was (its pixels, its point and the points it is joined to the
 * character by) and what has been done to it (turned so many degrees, flipped, moved so many pixels). What it looks
 * like now is made from those, so turning it again starts from the picture as it was rather than from a turned copy
 * that has lost its corners. It turns about the point it is joined by (a weapon about the hand, a cap about the brow),
 * or about its own point when it has none (an NPC about its feet), so that point stays where it is. Pixels are moved
 * whole (no smoothing), as the game's pictures are drawn.
 *
 * Nothing here is sent anywhere: the page shows an edit as it goes, and Save turns it into a picture of yours.
 */
import { h, fill } from './ui.js';

/** A picture (its address) in a canvas of its own, to paint on. */
export async function loadCanvas(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  return c;
}

/**
 * Starts an edit of a picture (a canvas node: _canvas, origin, map...) found at `url`. `saved` is what Save kept of an
 * earlier edit of it ({ from, url, origin, map, e }): it starts from that picture as it was, with what was done to it.
 */
export async function startEdit(node, url, saved = null) {
  const pixels = await loadCanvas(saved ? saved.url : url);
  return {
    node, pixels, painted: false, live: null, v: 0,
    base: { canvas: saved ? saved.from : node._canvas, origin: [...(saved?.origin || node.origin || [0, 0])], map: structuredClone(saved ? saved.map ?? null : node.map ?? null) },
    e: { angle: 0, flipX: false, flipY: false, dx: 0, dy: 0, ...(saved?.e || {}) },
    e0: { angle: 0, flipX: false, flipY: false, dx: 0, dy: 0, ...(saved?.e || {}) },
  };
}
/** Whether an edit has changed its picture since it was started (painted, or turned, flipped or moved more). */
export const touched = (ed) => !!ed && (ed.painted || ['angle', 'flipX', 'flipY', 'dx', 'dy'].some((k) => ed.e[k] !== ed.e0[k]));
/** Whether an edit turns or flips its picture (so its pixels are not the picture's as they were). */
export const turns = (e) => ((e.angle % 360) + 360) % 360 !== 0 || e.flipX || e.flipY;
/** Works out what an edit looks like now (edit.live), after anything about it changes. */
export function remake(edit) { edit.live = made(edit.pixels, edit.base, edit.e); edit.v++; return edit.live; }

/** What pixels (a canvas) with a point and join points (base) look like turned, flipped and moved (e): { canvas, w, h, origin, map }. */
export function made(pixels, base, e) {
  const w = pixels.width, h = pixels.height, o = base.origin || [0, 0], map = base.map && Object.keys(base.map).length ? base.map : null;
  const join = map ? Object.keys(map)[0] : null, pv = join ? [o[0] + map[join][0], o[1] + map[join][1]] : [o[0], o[1]];
  if (!turns(e)) return { canvas: pixels, w, h, origin: [o[0] - e.dx, o[1] - e.dy], map: map && structuredClone(map) };
  const a = (e.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), fx = e.flipX ? -1 : 1, fy = e.flipY ? -1 : 1;
  // a point of the picture as it was -> where it is now (about the pivot), and back
  const fwd = (x, y) => { const X = (x - pv[0]) * fx, Y = (y - pv[1]) * fy; return [pv[0] + X * cos - Y * sin, pv[1] + X * sin + Y * cos]; };
  const back = (x, y) => { const X = x - pv[0], Y = y - pv[1]; return [pv[0] + (X * cos + Y * sin) * fx, pv[1] + (-X * sin + Y * cos) * fy]; };
  const cs = [fwd(0, 0), fwd(w, 0), fwd(0, h), fwd(w, h)], xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
  const x0 = Math.floor(Math.min(...xs) + 1e-6), y0 = Math.floor(Math.min(...ys) + 1e-6);
  const W = Math.max(1, Math.ceil(Math.max(...xs) - 1e-6) - x0), H = Math.max(1, Math.ceil(Math.max(...ys) - 1e-6) - y0);
  const src = pixels.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, out = new ImageData(W, H), d = out.data;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const [sx, sy] = back(x0 + i + 0.5, y0 + j + 0.5), ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      const s = (iy * w + ix) * 4, t = (j * W + i) * 4;
      d[t] = src[s]; d[t + 1] = src[s + 1]; d[t + 2] = src[s + 2]; d[t + 3] = src[s + 3];
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.getContext('2d').putImageData(out, 0, 0);
  const at = (x, y) => { const q = fwd(x, y); return [Math.round(q[0] - x0), Math.round(q[1] - y0)]; };
  const O = at(o[0], o[1]);
  let m2 = null;
  if (map) { m2 = {}; for (const [k, v] of Object.entries(map)) { const P = at(o[0] + v[0], o[1] + v[1]); m2[k] = [P[0] - O[0], P[1] - O[1]]; } }
  return { canvas, w: W, h: H, origin: [O[0] - e.dx, O[1] - e.dy], map: m2 };
}
/** A canvas as a PNG. */
export const pngOf = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png'));

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const TOOLS = [['pencil', 'Pencil', 'B'], ['eraser', 'Eraser', 'E'], ['picker', 'Pick a colour', 'I'], ['fill', 'Fill', 'G']];

/**
 * Painting on a picture's pixels (a canvas, changed in place), zoomed in: a pencil, an eraser, a colour picker and a
 * fill, the picture's own colours to pick from, undo and redo. `onChange()` after each change (each bit of a stroke);
 * `onRoom(n)` when n pixels of room were added on every side (the picture's point moves with its pixels).
 */
export function pixelEditor(pixels, { onChange, onRoom, note = 'Paint on it with the mouse; the character shows it as you go. Right-click picks a colour.' } = {}) {
  let tool = 'pencil', colour = '#000000', size = 1, k = 1, stroke = null;
  const undo = [], redo = [];
  const ctx = () => pixels.getContext('2d', { willReadFrequently: true });
  const view = h('canvas', { class: 'px-view', tabindex: 0, 'aria-label': 'The picture, zoomed in: paint on it' }), vctx = view.getContext('2d');
  const pick = h('input', { type: 'color', value: colour, title: 'The colour painted', 'aria-label': 'Colour', oninput: (e) => { colour = e.target.value; } });
  const swatches = h('div', { class: 'px-swatches' });
  const toolBtns = TOOLS.map(([id, label, key]) => h('button', { type: 'button', class: id === tool ? 'on' : null, 'aria-pressed': id === tool, title: `${label} (${key})`, onclick: () => setTool(id) }, label));
  const sizeSel = h('select', { 'aria-label': 'Brush size', title: 'Brush size', onchange: (e) => { size = Number(e.target.value); } }, [1, 2, 3, 4].map((n) => h('option', { value: n }, `${n} px`)));
  const undoBtn = h('button', { type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => step(undo, redo) }, 'Undo'), redoBtn = h('button', { type: 'button', title: 'Redo (Ctrl+Y)', onclick: () => step(redo, undo) }, 'Redo');
  const zoomOut = h('button', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => zoom(-1) }, '−'), zoomIn = h('button', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => zoom(1) }, '+');
  const room = h('button', { type: 'button', title: 'Four pixels of empty room on every side, to paint past its edges', onclick: () => addRoom(4) }, 'More room');
  const el = h('div', { class: 'px-editor' },
    h('div', { class: 'px-tools' }, h('div', { class: 'segmented' }, toolBtns), pick, sizeSel),
    h('div', { class: 'px-tools' }, undoBtn, redoBtn, h('span', { class: 'sep' }), zoomOut, zoomIn, room),
    swatches, h('div', { class: 'px-scroll' }, view),
    h('p', { class: 'muted' }, note));

  function setTool(id) { tool = id; toolBtns.forEach((b, i) => { b.classList.toggle('on', TOOLS[i][0] === id); b.setAttribute('aria-pressed', TOOLS[i][0] === id); }); }
  function fit() { k = Math.max(2, Math.min(16, Math.floor(320 / Math.max(pixels.width, pixels.height)))); }
  function zoom(by) { k = Math.max(1, Math.min(24, k + by * (k >= 8 ? 2 : 1))); render(); }
  function render() {
    view.width = pixels.width * k; view.height = pixels.height * k;
    vctx.imageSmoothingEnabled = false;
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.drawImage(pixels, 0, 0, view.width, view.height);
    if (k >= 6) {
      vctx.strokeStyle = 'rgba(128,128,128,0.25)'; vctx.lineWidth = 1; vctx.beginPath();
      for (let x = 0; x <= pixels.width; x++) { vctx.moveTo(x * k + 0.5, 0); vctx.lineTo(x * k + 0.5, view.height); }
      for (let y = 0; y <= pixels.height; y++) { vctx.moveTo(0, y * k + 0.5); vctx.lineTo(view.width, y * k + 0.5); }
      vctx.stroke();
    }
    undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
  }
  /** The picture's own colours (the most used first), to pick from. */
  function colours() {
    const d = ctx().getImageData(0, 0, pixels.width, pixels.height).data, count = new Map();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { const c = hex(d[i], d[i + 1], d[i + 2]); count.set(c, (count.get(c) || 0) + 1); }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([c]) => c);
    fill(swatches, top.map((c) => h('button', { type: 'button', class: 'px-swatch', style: { background: c }, title: c, 'aria-label': `Colour ${c}`, onclick: () => { colour = c; pick.value = c; if (tool !== 'pencil' && tool !== 'fill') setTool('pencil'); } })));
  }
  const keep = () => { undo.push(ctx().getImageData(0, 0, pixels.width, pixels.height)); if (undo.length > 60) undo.shift(); redo.length = 0; };
  function step(from, to) {
    const img = from.pop();
    if (!img) return;
    to.push(ctx().getImageData(0, 0, pixels.width, pixels.height));
    if (img.width !== pixels.width || img.height !== pixels.height) { to.pop(); return; }
    ctx().putImageData(img, 0, 0);
    changed();
  }
  let queued = false;
  function changed() {
    render();
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; onChange?.(); }); }
  }
  function at(e) { const r = view.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * pixels.width), Math.floor(((e.clientY - r.top) / r.height) * pixels.height)]; }
  function dab(x, y) {
    const c = ctx(), half = Math.floor((size - 1) / 2);
    if (tool === 'eraser') c.clearRect(x - half, y - half, size, size);
    else { c.fillStyle = colour; c.fillRect(x - half, y - half, size, size); }
  }
  function line(a, b) {   // every pixel from a to b (a stroke drawn fast still joins up)
    let [x0, y0] = a;
    const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 4096; i++) {
      dab(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function pickAt(x, y) {
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return;
    const d = ctx().getImageData(x, y, 1, 1).data;
    if (d[3] === 0) return;
    colour = hex(d[0], d[1], d[2]); pick.value = colour;
  }
  function flood(x, y) {
    const w = pixels.width, hh = pixels.height;
    if (x < 0 || y < 0 || x >= w || y >= hh) return;
    const img = ctx().getImageData(0, 0, w, hh), d = img.data, i0 = (y * w + x) * 4, want = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const n = parseInt(colour.slice(1), 16), put = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    if (want.every((v, i) => v === put[i])) return;
    const same = (i) => (want[3] === 0 ? d[i + 3] === 0 : d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2] && d[i + 3] === want[3]);
    const todo = [x, y];
    while (todo.length) {
      const py = todo.pop(), px = todo.pop(), i = (py * w + px) * 4;
      if (px < 0 || py < 0 || px >= w || py >= hh || !same(i)) continue;
      d[i] = put[0]; d[i + 1] = put[1]; d[i + 2] = put[2]; d[i + 3] = put[3];
      todo.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
    ctx().putImageData(img, 0, 0);
  }
  function addRoom(n) {
    keep();
    const old = ctx().getImageData(0, 0, pixels.width, pixels.height);
    pixels.width += 2 * n; pixels.height += 2 * n;
    ctx().putImageData(old, n, n);
    undo.length = 0; redo.length = 0;   // (a different size: the steps before can't be undone onto it)
    onRoom?.(n);
    changed();
  }
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('pointerdown', (e) => {
    const [x, y] = at(e);
    if (e.button === 2 || tool === 'picker') { pickAt(x, y); if (tool === 'picker' && e.button === 0) setTool('pencil'); return; }
    if (e.button !== 0) return;
    keep();
    if (tool === 'fill') { flood(x, y); changed(); colours(); return; }
    stroke = [x, y];
    dab(x, y); changed();
    view.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  view.addEventListener('pointermove', (e) => { if (!stroke) return; const p = at(e); line(stroke, p); stroke = p; changed(); });
  const end = () => { if (stroke) { stroke = null; colours(); } };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); if (e.shiftKey) step(redo, undo); else step(undo, redo); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); step(redo, undo); return; }
    const t = TOOLS.find((x) => x[2].toLowerCase() === key);
    if (t && !e.ctrlKey && !e.metaKey) setTool(t[0]);
  });
  fit(); render(); colours();
  return { el, render };
}
