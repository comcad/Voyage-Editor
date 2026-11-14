/**
 * An equip worn: a plain character (the first skin, face and hair) wearing the equip being edited, as the game draws
 * it (the client's own character.js), in a pose you pick, animating. The equip shown is the one in the editor, changes
 * not saved included: it is handed to the drawing in place of the file the server has.
 */
import { h, fill } from './ui.js';
import { Assets, prepare } from '../assets.js';
import { CharacterLook, loadZmap, drawParts, setCharSprites, lookCanvases, equipPath } from '../character.js';

const SCALE = 2, W = 240, H = 220;
let assets = null, zmap = null;

export function wornPreview() {
  setCharSprites(false);   // (each part drawn as it is: nothing kept between changes)
  assets ??= new Assets('/assets');
  zmap ??= loadZmap(assets);
  const canvas = h('canvas', { class: 'worn-canvas', width: W, height: H, 'aria-label': 'The equip worn by a character' });
  const pose = h('select', { 'aria-label': 'Pose' }), face = h('button', { type: 'button', title: 'Face the other way' }, 'Turn');
  const play = h('button', { type: 'button' }, 'Pause'), step = h('button', { type: 'button', title: 'The next frame' }, 'Next frame');
  const note = h('p', { class: 'muted worn-note' });
  const el = h('div', { class: 'worn' }, canvas, h('div', { class: 'worn-controls' }, pose, face, play, step), note);
  let look = null, action = 'stand1', frame = 0, back = false, t = 0, last = 0, right = false, running = true, seq = 0;

  const ctx = canvas.getContext('2d');
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.scale(SCALE, SCALE);
    ctx.strokeStyle = 'rgba(128,128,128,0.35)'; ctx.beginPath(); ctx.moveTo(10, 95); ctx.lineTo(W / SCALE - 10, 95); ctx.stroke();   // the ground
    if (look?.loaded && look.has(action)) drawParts(ctx, assets, look.compose(action, frame), W / SCALE / 2, 95, right, 1, true);
  }
  function tick(now) {
    if (!el.isConnected) return;   // (taken off the page: stops)
    if (look?.loaded && running && look.has(action)) {
      t += now - (last || now);
      const d = look.delay(action, frame);
      if (t >= d) { t -= d; const n = look.nextFrame(action, frame, back); frame = n.frame; back = n.back; }
    }
    last = now;
    draw();
    requestAnimationFrame(tick);
  }
  pose.addEventListener('change', () => { action = pose.value; frame = 0; back = false; t = 0; ready(); });
  face.addEventListener('click', () => { right = !right; draw(); });
  play.addEventListener('click', () => { running = !running; play.textContent = running ? 'Pause' : 'Play'; });
  step.addEventListener('click', () => { if (!look?.has(action)) return; running = false; play.textContent = 'Play'; const n = look.nextFrame(action, frame, back); frame = n.frame; back = n.back; draw(); });
  function ready() { if (look?.loaded) assets.preload(lookCanvases(look, [action])); }

  /**
   * Shows the equip `rec` ({ id, tree }) worn, in pose `want` when it has it. Called again after each change; only
   * the newest call's character is drawn.
   */
  async function show(rec, want = null) {
    const mine = ++seq, path = equipPath(rec.id);
    if (!path) { note.textContent = `An equip numbered ${rec.id} isn't one a character wears.`; return; }
    await zmap;
    assets.jsonCache.set(path, Promise.resolve(prepare(structuredClone(rec.tree), 'Character')));
    const next = new CharacterLook(assets, { skin: 0, face: 20000, hair: 30030, equips: [rec.id], gender: 0 });
    await next.load();
    if (mine !== seq) return;
    look = next;
    // the poses the body has, the equip's own first
    const own = Object.keys(rec.tree).filter((k) => k !== 'info' && look.has(k)), rest = look.actionList().filter((k) => !own.includes(k));
    if (want && look.has(want)) action = want;
    else if (!look.has(action)) action = look.standAction();
    fill(pose, own.length ? h('optgroup', { label: 'Its own poses' }, own.map((k) => h('option', { value: k }, k))) : null,
      h('optgroup', { label: 'Other poses' }, rest.map((k) => h('option', { value: k }, k))));
    pose.value = action;
    if (frame >= look.frameCount(action)) frame = 0;
    note.textContent = own.length ? '' : 'It has no poses of its own: nothing of it shows on a character.';
    ready();
  }
  requestAnimationFrame(tick);
  return { el, show, get action() { return action; } };
}
