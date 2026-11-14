/**
 * The Animate view: an equip on a character, or an NPC, large, in a pose and frame you pick, playing or still. Click a
 * part of it (the equip's, not the character's) and change it right there: drag it into place, turn it, flip it,
 * paint its pixels, put it in another layer or use another picture. Everything shows as you do it; Save keeps it.
 *
 * What it is shown from is the editor's own record (its tree, changed in place) and the edits of its pictures
 * (picedit.js), which the tab keeps until Save makes them pictures of yours. The tab says what a frame's parts are
 * (partsOf), so a part that is really a look's layer, or another pose's frame, says so and can be made its own.
 */
import { h, fill, toast } from './ui.js';
import { prepare } from '../assets.js';
import { CharacterLook, drawParts, setCharSprites, equipPath, lookCanvases } from '../character.js';
import { shared } from './preview.js';
import { pixelEditor, remake, touched } from './picedit.js';

const isCanvas = (v) => v !== null && typeof v === 'object' && typeof v._canvas === 'string';
const numKeys = (o) => Object.keys(o || {}).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b);
const POSE_WORDS = { stand1: 'standing', stand2: 'standing, two hands', walk1: 'walking', walk2: 'walking, two hands', alert: 'on guard', jump: 'jumping', prone: 'lying down', fly: 'flying',
  ladder: 'on a ladder', rope: 'on a rope', sit: 'sitting', swingO1: 'swing', swingO2: 'swing 2', swingO3: 'swing 3', swingOF: 'swing, final', swingT1: 'swing, two hands', swingT2: 'swing, two hands 2',
  swingT3: 'swing, two hands 3', swingTF: 'swing, two hands, final', stabO1: 'stab', stabO2: 'stab 2', stabOF: 'stab, final', stabT1: 'stab, two hands', stabT2: 'stab, two hands 2', stabTF: 'stab, two hands, final',
  shoot1: 'shooting a bow', shoot2: 'shooting a crossbow', shot: 'shooting a gun', proneStab: 'attacking lying down', heal: 'healing', dead: 'dead' };

/**
 * o = { kind: 'equip' | 'npc', rec, pose, edits (picture node -> its edit), editFor(node), dropEdit(node), touch(),
 *       picSrc(node), partsOf(pose, frame) -> [{ node, name, note, separate: { label, run } }] or null (not worn
 *       in it), ownPoses(), addPose(pose, frames), replacePicture(node), zLayers(), ownLooks(), addFrame(pose, f),
 *       removeFrame(pose, f) }
 */
export function studio(o) {
  const { assets, zmap } = shared();
  setCharSprites(false);
  const equip = o.kind === 'equip';
  let look = null, seq = 0, action = o.pose || null, frame = 0, back = false, playing = false, right = false, t = 0, last = 0;
  let view = { k: 3, x: 0, y: 0 }, sel = null, hover = null, drag = null, painting = false, alive = true;
  let recAt = new Map(), recPath = new Map(), cloneAt = new Map();   // (equip) a picture's place in the tree <-> the record's node, the drawn copy's node
  const images = new Map();   // (NPC) pictures by address

  // ---------------------------------------------------------------- the stage
  const cv = h('canvas', { class: 'studio-canvas', tabindex: 0, 'aria-label': 'The stage: click a part to change it, drag it to move it, the arrow keys to nudge it' });
  const ctx = cv.getContext('2d');
  const probe = h('canvas', { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const poseSel = h('select', { 'aria-label': 'Pose', onchange: (e) => { action = e.target.value; frame = 0; back = false; t = 0; sel = null; afterPose(); } });
  const strip = h('div', { class: 'frame-strip', role: 'group', 'aria-label': 'Frames' });
  const playBtn = h('button', { type: 'button', onclick: () => setPlaying(!playing) }, 'Play');
  const turnBtn = h('button', { type: 'button', title: 'Face the other way', onclick: () => { right = !right; } }, 'Turn');
  const zoomLabel = h('span', { class: 'muted' });
  const bar = h('div', { class: 'studio-bar' }, poseSel, strip, playBtn, turnBtn, h('span', { class: 'spacer' }),
    h('button', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => zoomBy(-1) }, '−'), zoomLabel,
    h('button', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => zoomBy(1) }, '+'),
    h('button', { type: 'button', title: 'Back to the middle', onclick: () => { view.x = 0; view.y = 0; } }, 'Centre'));
  const hint = h('div', { class: 'studio-hint' });
  const holder = h('div', { class: 'studio-holder' }, cv);
  const side = h('div', { class: 'studio-side' });
  const el = h('div', { class: 'studio' }, h('div', { class: 'studio-stage' }, bar, holder, hint), side);
  new ResizeObserver(() => { cv.width = Math.max(50, holder.clientWidth); cv.height = Math.max(50, holder.clientHeight); }).observe(holder);

  const feet = () => [Math.round(cv.width / 2 + view.x), Math.round(cv.height * 0.72 + view.y)];
  function zoomBy(by, at = null) {
    const k = Math.max(1, Math.min(10, view.k + by));
    if (k === view.k) return;
    if (at) { const [fx, fy] = feet(), lx = (at[0] - fx) / view.k, ly = (at[1] - fy) / view.k; view.x += (at[0] - lx * k) - fx; view.y += (at[1] - ly * k) - fy; }
    view.k = k;
  }
  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    if (!on) { drawStrip(); drawSide(); }
  }

  // ---------------------------------------------------------------- what is drawn (an equip worn, or an NPC)
  /** (equip) The character wearing the record's equip as it is now: built again after a change of shape (a pose added...). */
  async function build() {
    const mine = ++seq;
    await zmap;
    const tr = o.rec.tree, clone = structuredClone(tr);
    recAt = new Map(); recPath = new Map();
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        const v = a[k];
        if (!v || typeof v !== 'object' || !b?.[k]) continue;
        if (isCanvas(v)) { recAt.set(path + k, v); recPath.set(v, path + k); b[k]._ed = path + k; } else walk(v, b[k], `${path}${k}/`);
      }
    };
    walk(tr, clone, '');
    const tree = prepare(clone, 'Character');
    assets.jsonCache.set(equipPath(o.rec.id), Promise.resolve(tree));
    const next = new CharacterLook(assets, { skin: 0, face: 20000, hair: 30030, equips: [o.rec.id], gender: 0 });
    await next.load();
    if (mine !== seq || !alive) return;
    cloneAt = new Map();
    const seen = new Set(), find = (n) => { if (!n || typeof n !== 'object' || seen.has(n)) return; seen.add(n); if (typeof n._ed === 'string') cloneAt.set(n._ed, n); for (const v of Object.values(n)) find(v); };
    find(tree);
    look = next;
    applyLive();
    const own = o.ownPoses().filter((p) => look.has(p)), rest = look.actionList().filter((p) => !own.includes(p));
    if (!action || !look.has(action)) action = own.includes('stand1') ? 'stand1' : own[0] || look.standAction();
    fill(poseSel, own.length ? h('optgroup', { label: 'Its own poses' }, own.map((p) => h('option', { value: p }, POSE_WORDS[p] ? `${p}  (${POSE_WORDS[p]})` : p))) : null,
      h('optgroup', { label: own.length ? 'Poses it isn’t worn in' : 'Poses' }, rest.map((p) => h('option', { value: p }, POSE_WORDS[p] ? `${p}  (${POSE_WORDS[p]})` : p))));
    poseSel.value = action;
    if (frame >= look.frameCount(action)) frame = 0;
    afterPose(false);
  }
  /** (NPC) Its poses, from the record. */
  function buildNpc() {
    const poses = o.ownPoses();
    if (!action || !poses.includes(action)) action = poses.includes('stand') ? 'stand' : poses[0] || null;
    fill(poseSel, poses.map((p) => h('option', { value: p }, p)));
    if (action) poseSel.value = action;
    afterPose(false);
  }
  function afterPose(keepSel = false) {
    if (!keepSel) sel = null;
    if (equip && look) assets.preload(lookCanvases(look, [action]));
    if (frame >= frameCount()) frame = 0;
    drawStrip(); drawSide();
  }
  const frameCount = () => (equip ? (look?.has(action) ? look.frameCount(action) : 0) : numKeys(o.rec.tree[action]).length);
  /** A picture's live look put in place of the drawn copy's (equip), so the character wears it as it is now. */
  function applyLive() {
    if (!equip || !look) return;
    for (const [node, path] of recPath) {
      const cn = cloneAt.get(path);
      if (!cn) continue;
      const ed = o.edits.get(node);
      if (ed?.live) {
        const key = `_live/${o.rec.id}/${path}`;
        putLive(key, ed.live.canvas);
        cn._canvas = key; cn._w = ed.live.w; cn._h = ed.live.h; cn.origin = ed.live.origin;
        if (ed.live.map) cn.map = ed.live.map;
        delete cn._sheet; delete cn._at;
      }
      if (node.z !== undefined) cn.z = node.z;
    }
    look.composed = null;
  }
  function putLive(key, canvas) {
    const e = assets.imgCache.get(key);
    if (e) { e.img = canvas; return; }
    assets.imgCache.set(key, { img: canvas, ready: true, started: true, pri: 0, tries: 0, promise: Promise.resolve(canvas) });
  }
  /** (NPC) A picture of the record: its live edit, or the picture itself once it has loaded. */
  function npcPic(node) {
    const ed = o.edits.get(node);
    if (ed?.live) return { img: ed.live.canvas, origin: ed.live.origin, w: ed.live.w, h: ed.live.h };
    const url = o.picSrc(node);
    let img = images.get(url);
    if (!img) { img = new Image(); img.src = url; images.set(url, img); }
    return img.complete && img.naturalWidth ? { img, origin: node.origin || [0, 0], w: img.naturalWidth, h: img.naturalHeight } : null;
  }
  /** (NPC) The picture of the pose's frame (a frame the same as another pose's is put through). */
  const npcNode = () => o.partsOf(action, frame)?.[0]?.node || null;

  // ---------------------------------------------------------------- drawing, every frame
  function tick(now) {
    const n = frameCount();
    if (playing && n > 1) {
      t += Math.min(250, now - (last || now));
      for (let i = 0; i < 8; i++) {
        const d = equip ? look.delay(action, frame) : Math.abs(Number(npcNode()?.delay) || 100) || 100;
        if (t < d) break;
        t -= d;
        if (equip) { const x = look.nextFrame(action, frame, back); frame = x.frame; back = x.back; } else frame = (frame + 1) % n;
        markStrip();
      }
    }
    last = now;
    render();
  }
  /** The parts drawn this frame (equip): [{ node, x, y }] at the feet, facing left. */
  const composed = () => (equip && look?.loaded && look.has(action) ? look.compose(action, frame) : []);
  function render() {
    const W = cv.width, H = cv.height, [fx, fy] = feet(), k = view.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.strokeStyle = 'rgba(128,128,128,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, fy + 0.5); ctx.lineTo(W, fy + 0.5); ctx.stroke();
    zoomLabel.textContent = `${k}×`;
    ctx.save();
    ctx.translate(fx, fy); ctx.scale(k, k);
    if (equip) drawParts(ctx, assets, composed(), 0, 0, right, 1, true);
    else {
      const node = npcNode(), p = node && npcPic(node);
      if (p) { if (right) ctx.scale(-1, 1); ctx.drawImage(p.img, -p.origin[0], -p.origin[1]); }
    }
    ctx.restore();
    // the part picked (solid) and the one under the pointer (dashed), with the point it is joined by
    for (const [box, solid] of [[boxOf(hover), false], [boxOf(sel), true]]) {
      if (!box || (!solid && hover === sel)) continue;
      ctx.setLineDash(solid ? [] : [4, 3]);
      ctx.strokeStyle = solid ? '#2a78d6' : 'rgba(42,120,214,0.75)'; ctx.lineWidth = solid ? 2 : 1;
      ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
      if (solid && box.pivot) { ctx.setLineDash([]); ctx.fillStyle = '#eb6834'; ctx.beginPath(); ctx.arc(box.pivot[0], box.pivot[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.setLineDash([]);
  }
  /** Where a part (its place in the tree; for an NPC the frame's picture) is on the stage: { x, y, w, h, pivot }. */
  function boxOf(key) {
    if (!key) return null;
    const [fx, fy] = feet(), k = view.k;
    const toScreen = (lx, ly) => [fx + (right ? -lx : lx) * k, fy + ly * k];
    if (!equip) {
      const node = npcNode(), p = node && npcPic(node);
      if (!p) return null;
      const [x0, y0] = toScreen(-p.origin[0], -p.origin[1]), [x1] = toScreen(-p.origin[0] + p.w, 0);
      return { x: Math.min(x0, x1), y: y0, w: p.w * k, h: p.h * k, pivot: toScreen(0, 0) };
    }
    const part = composed().find((p) => p.node._ed === key);
    if (!part) return null;
    const n = part.node, w = n._w || 0, hh = n._h || 0, [x0, y0] = toScreen(part.x, part.y), [x1] = toScreen(part.x + w, 0);
    const join = n.map && Object.keys(n.map)[0], o2 = n.origin || [0, 0];
    return { x: Math.min(x0, x1), y: y0, w: w * k, h: hh * k, pivot: toScreen(part.x + o2[0] + (join ? n.map[join][0] : 0), part.y + o2[1] + (join ? n.map[join][1] : 0)) };
  }
  /** The equip's part at a point of the stage (the front-most whose pixel there isn't see-through), or null. */
  function partAt(cx, cy) {
    if (!equip) { const b = boxOf('npc'); return b && cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h ? 'npc' : null; }
    const [fx, fy] = feet(), k = view.k, lx = ((cx - fx) / k) * (right ? -1 : 1), ly = (cy - fy) / k;
    const parts = composed();
    let rectHit = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], n = p.node;
      if (typeof n._ed !== 'string') continue;
      const px = Math.floor(lx - p.x), py = Math.floor(ly - p.y);
      if (px < 0 || py < 0 || px >= (n._w || 0) || py >= (n._h || 0)) continue;
      rectHit ??= n._ed;
      const s = assets.slice(n);
      if (!s) continue;
      probe.clearRect(0, 0, 1, 1);
      probe.drawImage(s.img, s.x + px, s.y + py, 1, 1, 0, 0, 1, 1);
      if (probe.getImageData(0, 0, 1, 1).data[3] > 0) return n._ed;
    }
    return rectHit;
  }

  // ---------------------------------------------------------------- the mouse on the stage
  const point = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  /** The record's node a key stands for (equip: its place in the tree; NPC: the frame's picture). */
  const nodeOf = (key) => (equip ? recAt.get(key) : key ? npcNode() : null);
  cv.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0) return;
    cv.focus({ preventScroll: true });
    const [cx, cy] = point(e), hit = partAt(cx, cy);
    cv.setPointerCapture(e.pointerId);
    if (hit) {
      if (playing) setPlaying(false);
      if (sel !== hit) { sel = hit; drawSide(); }
      const node = nodeOf(hit);
      drag = { kind: 'part', node, sx: cx, sy: cy, ed: null, moved: false };
      const d = drag;
      d.ed = await o.editFor(node);
      d.dx0 = d.ed.e.dx; d.dy0 = d.ed.e.dy;
    } else drag = { kind: 'pan', sx: cx, sy: cy, x: view.x, y: view.y };
  });
  cv.addEventListener('pointermove', (e) => {
    const [cx, cy] = point(e);
    if (!drag) { const was = hover; hover = partAt(cx, cy); if (hover !== was) cv.style.cursor = hover ? 'grab' : ''; return; }
    if (drag.kind === 'pan') { view.x = drag.x + cx - drag.sx; view.y = drag.y + cy - drag.sy; return; }
    if (!drag.ed) return;
    const ddx = ((cx - drag.sx) / view.k) * (right ? -1 : 1), ddy = (cy - drag.sy) / view.k;
    const nx = Math.round(drag.dx0 + ddx), ny = Math.round(drag.dy0 + ddy);
    if (nx === drag.ed.e.dx && ny === drag.ed.e.dy) return;
    drag.ed.e.dx = nx; drag.ed.e.dy = ny; drag.moved = true;
    cv.style.cursor = 'grabbing';
    changed(drag.ed, false);
  });
  const up = () => { const d = drag; drag = null; cv.style.cursor = hover ? 'grab' : ''; if (d?.moved) { o.touch(); drawSide(); } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!drag) hover = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1, point(e)); }, { passive: false });
  cv.addEventListener('keydown', async (e) => {
    const by = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!by || !sel) return;
    e.preventDefault();
    nudge(by[0] * (e.shiftKey ? 10 : 1) * (right ? -1 : 1), by[1] * (e.shiftKey ? 10 : 1));
  });
  async function nudge(dx, dy) {
    const node = nodeOf(sel);
    if (!node) return;
    const ed = await o.editFor(node);
    ed.e.dx += dx; ed.e.dy += dy;
    changed(ed, true);
  }
  /** An edit changed: what it looks like is made again and shown; `done`: it is a change to keep (not mid-drag). */
  function changed(ed, done) {
    remake(ed);
    applyLive();
    numbers?.();
    if (done) o.touch();
  }

  // ---------------------------------------------------------------- the bar's frames
  function drawStrip() {
    const n = frameCount();
    fill(strip, n ? Array.from({ length: n }, (_, i) => h('button', { type: 'button', class: i === frame ? 'on' : null, 'aria-pressed': i === frame, title: `Frame ${i}`, onclick: () => { setPlaying(false); frame = i; back = false; t = 0; sel = keepSel(); drawStrip(); drawSide(); } }, String(i))) : h('span', { class: 'muted' }, 'no frames'));
  }
  const markStrip = () => [...strip.children].forEach((b, i) => { if (b.tagName === 'BUTTON') { b.classList.toggle('on', i === frame); b.setAttribute('aria-pressed', i === frame); } });
  /** The part picked stays picked on another frame when it is the same picture there (a look's layer). */
  const keepSel = () => (equip && sel && (o.partsOf(action, frame) || []).some((p) => recPath.get(p.node) === sel) ? sel : null);

  // ---------------------------------------------------------------- the side: this frame's parts, and the one picked
  let numbers = null;
  function drawSide() {
    numbers = null;
    if (!equip && o.borrowed?.()) {
      hint.textContent = '';
      fill(side, h('h3', null, 'Animate'), h('p', null, o.borrowed()), h('button', { type: 'button', class: 'primary', onclick: async () => { if (await o.ownLooks()) buildNpc(); } }, 'Give it looks of its own (a copy)'));
      return;
    }
    if (!action) { fill(side, h('h3', null, 'Animate'), h('p', { class: 'muted' }, equip ? 'Reading the character...' : 'It has no poses yet: add one on the Looks board.')); hint.textContent = ''; return; }
    const parts = o.partsOf(action, frame), out = [h('h3', null, `${action}${POSE_WORDS[action] ? `  (${POSE_WORDS[action]})` : ''}, frame ${frame}`)];
    hint.textContent = playing ? 'Playing: click a part to stop on its frame and change it.' : equip ? 'Click a part of the equip to change it. Drag it to move it; arrow keys nudge it (Shift: 10 pixels). Drag the background to look about, the wheel to zoom.' : 'Drag the picture to move it; arrow keys nudge it. Drag the background to look about, the wheel to zoom.';
    if (parts === null) {
      out.push(h('p', null, `It isn’t worn in ${action}: the character shows without it.`),
        h('button', { type: 'button', class: 'primary', onclick: async () => { if (await o.addPose(action, frameCount())) { sel = null; await build(); } } }, `Wear it in ${action}`));
      fill(side, out);
      return;
    }
    if (!parts.length) out.push(h('p', { class: 'muted' }, 'Nothing of it is in this frame.'));
    // the parts, front-most first as drawn
    if (equip && parts.length) {
      out.push(h('div', { class: 'part-list' }, parts.map((p) => {
        const key = recPath.get(p.node);
        return h('button', { type: 'button', class: key === sel ? 'on' : null, onclick: () => { sel = key; drawSide(); o.editFor(p.node); } },
          h('img', { alt: '', src: o.picSrc(p.node) }), h('span', null, h('strong', null, p.name), h('span', { class: 'muted' }, `  ${p.node.z || ''}`)), p.note ? h('span', { class: 'chip' }, 'shared') : null);
      })));
    }
    const pickedPart = equip ? parts.find((p) => recPath.get(p.node) === sel) : parts[0];
    if (!equip && parts[0]) sel = 'npc';
    if (pickedPart) out.push(...tools(pickedPart));
    else if (equip && parts.length) out.push(h('p', { class: 'muted' }, 'Click a part on the character, or in the list, to change it.'));
    if (!equip) out.push(...frameTools());
    fill(side, out);
  }
  /** What can be done to the part picked. */
  function tools(part) {
    const node = part.node, ed = o.edits.get(node), e = ed?.e || { angle: 0, flipX: false, flipY: false, dx: 0, dy: 0 };
    const join = node.map && Object.keys(node.map)[0];
    const at = h('span', { class: 'muted' }), angle = h('input', { type: 'range', min: -180, max: 180, step: 1, value: e.angle, 'aria-label': 'Turn it, in degrees' });
    const deg = h('input', { type: 'number', min: -360, max: 360, step: 1, value: e.angle, class: 'deg', 'aria-label': 'Degrees' });
    const undoBtn = h('button', { type: 'button', class: 'quiet danger', onclick: async () => { o.dropEdit(node); painting = false; o.touch(); if (equip) await build(); else drawSide(); } }, 'Undo my changes to it');
    const flipX = h('button', { type: 'button', 'aria-pressed': !!e.flipX, class: e.flipX ? 'on' : null, onclick: () => edit((x) => { x.e.flipX = !x.e.flipX; }, true, () => drawSide()) }, 'Flip ↔');
    const flipY = h('button', { type: 'button', 'aria-pressed': !!e.flipY, class: e.flipY ? 'on' : null, onclick: () => edit((x) => { x.e.flipY = !x.e.flipY; }, true, () => drawSide()) }, 'Flip ↕');
    numbers = () => { const x = o.edits.get(node)?.e || e; undoBtn.hidden = !touched(o.edits.get(node)); at.textContent = x.dx || x.dy ? `moved ${x.dx > 0 ? '+' : ''}${x.dx}, ${x.dy > 0 ? '+' : ''}${x.dy}` : 'where it was'; if (document.activeElement !== angle) angle.value = x.angle; if (document.activeElement !== deg) deg.value = x.angle; };
    numbers();
    // (a picture turned before, and saved, comes back with its turn: shown once its edit has been read)
    if (!ed) o.editFor(node).then(() => { if (nodeOf(sel) === node && numbers) numbers(); }, () => {});
    angle.addEventListener('input', () => edit((x) => { x.e.angle = Number(angle.value); }, false));
    angle.addEventListener('change', () => o.touch());
    deg.addEventListener('change', () => { const v = Number(deg.value); if (Number.isFinite(v)) edit((x) => { x.e.angle = Math.max(-360, Math.min(360, Math.round(v))); }, true); });
    const layer = h('select', { 'aria-label': 'Its layer', onchange: (ev) => { node.z = ev.target.value; applyLive(); o.touch(); } }, h('option', { value: node.z ?? '' }, node.z ?? '(none)'));
    if (equip) o.zLayers().then((zs) => { fill(layer, (zs.includes(node.z) ? zs : [node.z, ...zs]).filter((z) => z !== undefined).map((z) => h('option', { value: z, selected: z === node.z }, z))); });
    const out = [h('div', { class: 'picked' }, h('h4', null, equip ? part.name : `Frame ${frame}`),
      part.note ? h('p', { class: 'note' }, part.note) : null,
      part.separate ? h('button', { type: 'button', onclick: async () => { await part.separate.run(); o.touch(); if (equip) { sel = null; await build(); } else drawSide(); } }, part.separate.label) : null)];
    out.push(h('div', { class: 'tool' }, h('strong', null, 'Move'), h('span', { class: 'muted' }, ' drag it on the stage, or'),
      h('div', { class: 'tool-row' }, [['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1], ['→', 1, 0]].map(([s, x, y]) => h('button', { type: 'button', 'aria-label': `Nudge ${s}`, onclick: () => nudge(x * (right ? -1 : 1), y) }, s)), at)));
    out.push(h('div', { class: 'tool' }, h('strong', null, 'Turn'), h('span', { class: 'muted' }, join ? ` about its ${join} point (the orange dot)` : equip ? ' about its point' : ' about its feet'),
      h('div', { class: 'tool-row' }, angle, deg, h('span', { class: 'muted' }, '°')),
      h('div', { class: 'tool-row' }, [-90, -15, 15, 90].map((d) => h('button', { type: 'button', onclick: () => edit((x) => { x.e.angle = ((x.e.angle + d + 540) % 360) - 180; }, true) }, `${d > 0 ? '+' : ''}${d}°`)), flipX, flipY)));
    if (equip) out.push(h('label', { class: 'field' }, h('span', null, 'Layer'), layer), h('p', { class: 'muted small' }, 'What it is drawn over and under: weapon over the body, weaponBelowBody under it, capOverHair over the hair...'));
    const paintBox = h('div', { class: 'paint-box' });
    const paintBtn = h('button', { type: 'button', class: painting ? 'on' : null, 'aria-pressed': painting, onclick: async () => { painting = !painting; drawSide(); } }, painting ? 'Stop painting' : 'Paint its pixels');
    out.push(h('div', { class: 'tool-row' }, paintBtn,
      h('button', { type: 'button', onclick: async () => { if (await o.replacePicture(node)) { o.dropEdit(node); if (equip) await build(); else drawSide(); } } }, 'Use another picture...'),
      undoBtn), paintBox);
    if (painting) {
      fill(paintBox, h('p', { class: 'muted' }, 'Reading the picture...'));
      o.editFor(node).then((x) => {
        if (!painting || !paintBox.isConnected) return;
        if (!x.live) remake(x);
        const pe = pixelEditor(x.pixels, {
          onChange: () => { x.painted = true; remake(x); applyLive(); numbers?.(); o.touch(); },
          onRoom: (n) => { x.base.origin = [x.base.origin[0] + n, x.base.origin[1] + n]; },
        });
        fill(paintBox, x.e.angle || x.e.flipX || x.e.flipY ? h('p', { class: 'muted small' }, 'You paint it as it was, before it is turned or flipped.') : null, pe.el);
      }, (err) => fill(paintBox, h('p', { class: 'error' }, `It can’t be painted: ${err.message}`)));
    }
    return out;
  }
  /** (NPC) The frame's delay, and frames to add or take off. */
  function frameTools() {
    const node = npcNode();
    if (!node) return [];
    return [h('div', { class: 'tool' }, h('label', { class: 'field' }, h('span', null, 'Shows for'), h('input', { type: 'number', min: 0, step: 10, value: Math.abs(Number(node.delay) || 100), onchange: (e) => { node.delay = Math.max(0, Number(e.target.value) || 0); o.touch(); } }), h('span', { class: 'muted' }, 'ms'))),
      h('div', { class: 'tool-row' }, h('button', { type: 'button', onclick: () => { o.addFrame(action, frame); frame += 1; o.touch(); afterPose(); } }, 'Copy this frame'),
        h('button', { type: 'button', class: 'quiet danger', onclick: () => { if (o.removeFrame(action, frame)) { frame = Math.max(0, frame - 1); o.touch(); afterPose(); } } }, 'Take this frame off'))];
  }
  /** Changes the picked part's edit (made when it is first changed) and shows it; `done`: one to keep. */
  async function edit(fn, done, then = null) {
    const node = nodeOf(sel);
    if (!node) return;
    const ed = await o.editFor(node);
    fn(ed);
    changed(ed, done);
    then?.();
  }

  // ---------------------------------------------------------------- the loop
  const loop = (now) => { if (!alive) return; if (el.isConnected) tick(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  if (equip) build().catch((err) => toast(`The character couldn’t be drawn: ${err.message}`, true)); else buildNpc();
  return { el, stop() { alive = false; seq++; } };
}
