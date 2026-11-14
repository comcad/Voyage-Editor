/**
 * Items (with equips), NPCs and quests, as boards of nodes: change one of the game's, or make one of your own from a
 * copy. Each opens as a board whose nodes are its parts, wired together the way they hang together; picking a node
 * shows what it holds beside the board, to change.
 *
 *   an equip   Equip -> Stats, Icon, Worn look -> one node for each pose. A pose wired "same as" another takes that
 *              one's frames (cut the wire and it has a copy of its own); a pose's frames are its parts, each with its
 *              picture, its point, the points it is joined to the character by and its layer. Beside: a character
 *              wearing it, in the pose picked.
 *   an item    Item -> Stats, Icon, What using it does.
 *   an NPC     Looks: NPC -> Settings, poses (their frames). Dialogue: what it says and does when talked to, made into
 *              its script on the game server when it is published (dialogue-script.js).
 *   a quest    Quest -> Given by -> To start -> Start lines -> Start gives -> Handed in to -> To finish -> End lines
 *              -> End gives, with the items to bring, monsters to hunt, quests needed and items given wired in.
 *
 * As with maps: Save keeps a draft only this page sees, Publish writes it into the assets' customs folder (which the
 * client and the server read) and Unpublish takes it out again. Export zip and Import zip carry one to another editor.
 */
import { h, fill, toast, dialog, settled, pickFromList, restartNotice, DIRS, pictureUrl } from './ui.js';
import { api } from './api.js';
import { nodeBoard, arrange } from './nodes.js';
import { wornPreview } from './preview.js';
import { compileDialogue, CHECKS, ACTS, outsOf } from './dialogue-script.js';
import { exportThing, readThingZip, importThing } from './thingzip.js';

const FAMILY = { equip: 'Character', item: 'Item', npc: 'Npc', quest: 'Quest' };
const NAMES = { equip: 'Equip', item: 'Item', npc: 'NPC', quest: 'Quest' };
/** A quest of your own to start from: the four parts the game keeps for one, each with its start (0) and its end (1). */
const EMPTY_QUEST = () => ({ QuestInfo: { name: 'A new quest', 0: '', 1: '', 2: '' }, Check: { 0: { npc: 0, lvmin: 1 }, 1: { npc: 0 } }, Act: { 0: {}, 1: { exp: 0 } }, Say: { 0: { 0: '' }, 1: { 0: '' } } });
const WORDS = { name: 'Name', desc: 'Description', func: 'Line under its name' };
/** What each may be given besides what it has (offered under "Add a field"). */
const MORE = {
  equip: ['reqLevel', 'reqJob', 'reqSTR', 'reqDEX', 'reqINT', 'reqLUK', 'incSTR', 'incDEX', 'incINT', 'incLUK', 'incPAD', 'incMAD', 'incPDD', 'incMDD', 'incACC', 'incEVA', 'incSpeed', 'incJump', 'incMHP', 'incMMP',
    'tuc', 'price', 'cash', 'attackSpeed', 'tradeBlock', 'only', 'notSale', 'timeLimited', 'knockback', 'equipTradeBlock', 'expireOnLogout', 'reqPOP'],
  item: ['price', 'slotMax', 'tradeBlock', 'only', 'quest', 'notSale', 'cash', 'timeLimited', 'success', 'cursed', 'incSTR', 'incDEX', 'incINT', 'incLUK', 'incPAD', 'incMAD', 'incPDD', 'incMDD', 'incACC', 'incEVA', 'incSpeed', 'incJump', 'incMHP', 'incMMP', 'reqLevel'],
  spec: ['hp', 'mp', 'hpR', 'mpR', 'time', 'pad', 'mad', 'pdd', 'mdd', 'acc', 'eva', 'speed', 'jump', 'moveTo', 'thaw', 'prob'],
  npc: [],
};
const HINTS = {
  reqLevel: 'The level needed to wear or use it.', reqJob: 'Which jobs may wear it (0: all).', reqSTR: 'STR needed.', reqDEX: 'DEX needed.', reqINT: 'INT needed.', reqLUK: 'LUK needed.',
  incSTR: 'STR it adds.', incDEX: 'DEX it adds.', incINT: 'INT it adds.', incLUK: 'LUK it adds.', incPAD: 'Weapon attack it adds.', incMAD: 'Magic attack it adds.', incPDD: 'Weapon defense it adds.', incMDD: 'Magic defense it adds.',
  incACC: 'Accuracy it adds.', incEVA: 'Avoidability it adds.', incSpeed: 'Speed it adds.', incJump: 'Jump it adds.', incMHP: 'Max HP it adds.', incMMP: 'Max MP it adds.',
  tuc: 'How many scrolls it can take.', price: 'What it sells for.', cash: '1: a Cash item.', attackSpeed: 'How fast it swings (lower is faster).', tradeBlock: '1: can’t be traded.', only: '1: only one can be owned.',
  notSale: '1: can’t be sold.', slotMax: 'How many fit in one slot.', success: 'A scroll’s chance to work, in percent.', cursed: 'A scroll’s chance to destroy the item, in percent.',
  hp: 'HP it restores.', mp: 'MP it restores.', hpR: 'HP it restores, in percent.', mpR: 'MP it restores, in percent.', time: 'How long it lasts, in milliseconds.',
  pad: 'Weapon attack while it lasts.', mad: 'Magic attack while it lasts.', pdd: 'Weapon defense while it lasts.', mdd: 'Magic defense while it lasts.', acc: 'Accuracy while it lasts.', eva: 'Avoidability while it lasts.',
  speed: 'Speed while it lasts.', jump: 'Jump while it lasts.', moveTo: 'The map it takes you to.',
};
/** The poses a character takes, in a few words. */
const POSES = {
  stand1: 'standing', stand2: 'standing, two hands', walk1: 'walking', walk2: 'walking, two hands', alert: 'on guard', jump: 'jumping', prone: 'lying down', proneStab: 'attacking lying down',
  fly: 'flying', ladder: 'on a ladder', rope: 'on a rope', sit: 'sitting', heal: 'healing', dead: 'dead', shoot1: 'shooting a bow', shoot2: 'shooting a crossbow', shot: 'shooting a gun',
  swingO1: 'swing, one hand', swingO2: 'swing, one hand 2', swingO3: 'swing, one hand 3', swingOF: 'swing, one hand, final', swingT1: 'swing, two hands', swingT2: 'swing, two hands 2', swingT3: 'swing, two hands 3',
  swingTF: 'swing, two hands, final', swingP1: 'swing, polearm', swingP2: 'swing, polearm 2', swingPF: 'swing, polearm, final', stabO1: 'stab, one hand', stabO2: 'stab, one hand 2', stabOF: 'stab, one hand, final',
  stabT1: 'stab, two hands', stabT2: 'stab, two hands 2', stabTF: 'stab, two hands, final',
};
/** The points a part is joined to the character by. */
const POINTS = ['navel', 'neck', 'hand', 'handMove', 'brow', 'earOverHead', 'earBelowHead'];
const isCanvas = (v) => v !== null && typeof v === 'object' && typeof v._canvas === 'string';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const numKeys = (o) => Object.keys(o || {}).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b);
const nextKey = (o) => String(numKeys(o).reduce((m, k) => Math.max(m, Number(k) + 1), 0));
/** A node's own poses: its keys (besides info) that hold frames. */
const posesOf = (t) => Object.keys(t || {}).filter((k) => k !== 'info' && !k.startsWith('_') && !/^\d+$/.test(k) && isObj(t[k]));
/** The pose a pose takes all its frames from ("same as"), or null: each frame a link ../<that pose>/<the same number>. */
function linkOf(t, pose) {
  const fs = numKeys(t[pose]);
  if (!fs.length) return null;
  let to = null;
  for (const f of fs) {
    const m = /^\.\.\/([^/]+)\/(\d+)$/.exec(t[pose][f]?._uol || '');
    if (!m || m[2] !== f || (to && to !== m[1])) return null;
    to = m[1];
  }
  return to;
}
/** What a link in a tree leads to (`chain`: the nodes from the root down to the one holding it). */
function follow(chain, uol) {
  const stack = chain.slice();
  for (const seg of uol.split('/')) { if (seg === '..') stack.pop(); else if (seg && seg !== '.') stack.push(stack[stack.length - 1]?.[seg]); if (!stack[stack.length - 1]) return null; }
  return stack[stack.length - 1];
}
/** A pose's frames with every link put through (a copy), for a pose that stops being "same as" another. */
function ownFrames(t, pose, depth = 0) {
  const out = {};
  for (const f of numKeys(t[pose])) {
    let v = t[pose][f];
    for (let i = 0; i < 4 && typeof v?._uol === 'string'; i++) v = follow([t, t[pose]], v._uol);
    if (isObj(v)) out[f] = structuredClone(v);
  }
  return depth < 4 ? out : {};
}

/*
 * An equip's shared looks. A cap keeps its pictures once, in looks of their own: default (seen from the front) and
 * backDefault (from behind, on a ladder or a rope), each holding its layers (default, defaultAc...: a picture each,
 * drawn at its own depth, joined to the character by its point). Its poses' frames only link to them, part by part
 * (../../default/default), so it looks the same in every pose.
 */
const LOOK_NAMES = { default: 'front look', backDefault: 'back look' };
/** Whether a key of an equip holds a look (its pictures as they are) rather than a pose (numbered frames). */
const isLook = (t, k) => k !== 'info' && isObj(t[k]) && (k in LOOK_NAMES || Object.values(t[k]).some(isCanvas));
const looksOf = (t) => posesOf(t).filter((k) => isLook(t, k));
const framePosesOf = (t) => posesOf(t).filter((k) => !isLook(t, k));
const lookName = (k) => LOOK_NAMES[k] || `look ${k}`;
/** A look's layers: its pictures, by name. */
const layersOf = (t, look) => Object.entries(t[look] || {}).filter(([, v]) => isCanvas(v));
const partLink = (look, part) => ({ _uol: `../../${look}/${part}` });
/** The look all of a pose's frames link to (every part ../../<look>/<part>), or null. */
function lookUse(t, pose) {
  const fs = numKeys(t[pose]);
  if (!fs.length) return null;
  let look = null;
  for (const f of fs) {
    const fr = t[pose][f];
    if (!isObj(fr) || typeof fr._uol === 'string') return null;
    const parts = Object.values(fr).filter(isObj);
    if (!parts.length) return null;
    for (const v of parts) {
      const m = /^\.\.\/\.\.\/([^/]+)\/[^/]+$/.exec(v._uol || '');
      if (!m || !isLook(t, m[1]) || (look && look !== m[1])) return null;
      look = m[1];
    }
  }
  return look;
}
/** A pose's frame as it is drawn, and the nodes down to it (a frame that is "the same as" another pose's is put through). */
function frameAt(t, pose, f) {
  let fr = t[pose]?.[f], chain = [t, t[pose]];
  for (let i = 0; i < 4 && typeof fr?._uol === 'string'; i++) {
    const m = /^\.\.\/([^/]+)\/(\d+)$/.exec(fr._uol);
    if (!m) return { fr: null, chain };
    chain = [t, t[m[1]]]; fr = t[m[1]]?.[m[2]];
  }
  return { fr: isObj(fr) ? fr : null, chain: [...chain, fr] };
}
/** A frame's part as it is drawn: the picture itself, or the one its link leads to ({ c, from }: from names the look). */
function partAt(chain, v) {
  if (isCanvas(v)) return { c: v, from: null };
  if (typeof v?._uol !== 'string') return { c: null, from: null };
  const c = follow(chain, v._uol), m = /^\.\.\/\.\.\/([^/]+)\/([^/]+)$/.exec(v._uol);
  return { c: isCanvas(c) ? c : null, from: m ? `${m[1]}/${m[2]}` : v._uol };
}
/** A pose's frames each a copy with every link put through, parts too (for a pose that stops using a look). */
function ownFramesDeep(t, pose) {
  const out = {};
  for (const f of numKeys(t[pose])) {
    const { fr, chain } = frameAt(t, pose, f);
    if (!fr) continue;
    out[f] = Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, isObj(v) && typeof v._uol === 'string' ? structuredClone(partAt(chain, v).c ?? v) : structuredClone(v)]));
  }
  return out;
}
/** Makes a pose use a look: `count` frames (its own number of them, or 1), each linking to every layer of the look. */
function useLook(t, pose, look, count) {
  const parts = layersOf(t, look).map(([k]) => k), n = count || Math.max(1, numKeys(t[pose]).length);
  t[pose] = Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), Object.fromEntries(parts.map((p) => [p, partLink(look, p)]))]));
}
/** A picture's address on the page. */
const src = (kind, c) => `/assets/${FAMILY[kind]}/${c._canvas}`;
/** The layers a part may be drawn in (Base/zmap.img), asked for once. */
let layers = null;
const zLayers = () => (layers ??= fetch('/assets/Base/zmap.img.json').then((r) => r.json()).then((z) => Object.keys(z).filter((k) => !k.startsWith('_'))).catch(() => []));

/** `kinds`: the kinds this tab works on ([['item', 'Items'], ['equip', 'Equips']]); `blurb`: a line about them. */
export function thingsTab(host, kinds, blurb) {
  let kind = kinds[0][0], rec = null, changed = false, view = 'look', picked = null, board = null, spec = null, preview = null;
  const list = h('div', { class: 'thing-list' }), editor = h('div', { class: 'thing-editor nodes-editor' });
  const inspect = h('aside', { class: 'thing-inspect' });

  // ---------------------------------------------------------------- finding
  const lookup = settled(async (q) => {
    let rows = [];
    try { rows = await api(`/c/${kind}?q=${encodeURIComponent(q)}`); } catch (e) { toast(e.message, true); }
    fill(list, rows.length ? rows.map((r) => h('button', { type: 'button', class: rec && rec.id === r.id && rec.kind === kind ? 'on' : null, onclick: () => open(kind, r.id) },
      h('span', null, h('strong', null, r.id), ' ', r.name || '(no name)', r.sub ? h('span', { class: 'muted' }, `  ${r.sub}`) : null),
      r.live ? h('span', { class: 'chip on' }, 'published') : null, r.draft ? h('span', { class: 'chip' }, 'draft') : null))
      : h('p', { class: 'empty' }, q ? 'Nothing by that number or name.' : `You have none of your own yet. Find one of the game’s by number or name.`));
  });
  const find = h('input', { type: 'search', placeholder: 'Number or name', oninput: (e) => lookup(e.target.value) });
  const pickKind = kinds.length > 1 ? h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which kind' }, kinds.map(([k, name]) => h('button', {
    type: 'button', class: k === kind ? 'on' : null, 'aria-pressed': k === kind,
    onclick: (e) => { kind = k; for (const b of pickKind.children) { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', b === e.currentTarget); } lookup(find.value); },
  }, name))) : null;

  const leave = () => !changed || confirm('It has changes that aren’t saved. Leave them?');
  async function open(k, id) {
    if (!leave()) return;
    try { show(await api(`/c/${k}/${id}`)); changed = false; draw(); lookup(find.value); } catch (e) { toast(e.message, true); }
  }
  /** Puts a record in the editor: a new board for it. */
  function show(next) {
    rec = next; picked = null; view = 'look'; board = null; spec = null;
    rec.layout = isObj(rec.layout) ? rec.layout : {};
    if (rec.kind === 'npc') rec.dialogue = isObj(rec.dialogue) && Array.isArray(rec.dialogue.nodes) ? rec.dialogue : { nodes: [{ id: 'start', type: 'start', x: 0, y: 0, data: {} }], wires: [] };
    preview = rec.kind === 'equip' ? wornPreview() : null;
  }
  const soon = settled(() => { if (board && spec) { showBoard(); if (preview && rec) preview.show(rec, posePicked()); } }, 450);
  const touch = () => { if (!changed) { changed = true; drawHead(); } soon(); };
  const body = () => ({ tree: rec.tree, words: rec.words, folder: rec.folder, layout: rec.layout, dialogue: rec.dialogue });

  // ---------------------------------------------------------------- saving, publishing, zips
  async function save() { try { rec.state = await api(`/c/${rec.kind}/${rec.id}`, { method: 'PUT', body: body() }); changed = false; drawHead(); lookup(find.value); toast('Saved as a draft.'); } catch (e) { toast(e.message, true); } }
  async function publish() {
    if (rec.kind === 'npc') {
      const made = compileDialogue(rec.dialogue, rec.id);
      if (made.problems.length && made.script && !confirm(`Its dialogue has problems:\n\n${made.problems.join('\n')}\n\nPublish anyway?`)) return;
    }
    try {
      rec.state = await api(`/c/${rec.kind}/${rec.id}/publish`, { method: 'POST', body: body() }); changed = false; drawHead(); lookup(find.value);
      restartNotice(`${NAMES[rec.kind]} ${rec.id} is published to the customs folder${rec.kind === 'npc' && compileDialogue(rec.dialogue, rec.id).script ? ', with its dialogue as its script (customs/scripts/npc)' : ''}.`);
    } catch (e) { toast(e.message, true); }
  }
  async function discard() {
    if (!confirm(rec.state.draft ? 'Throw away your draft? What is published stays.' : 'Throw away the changes made since it was opened?')) return;
    try {
      if (rec.state.draft) await api(`/c/${rec.kind}/${rec.id}/draft`, { method: 'DELETE' });
      const { kind: k, id } = rec, there = rec.state.assets || rec.state.live;
      changed = false; rec = null;
      if (there) await open(k, id); else { draw(); lookup(find.value); }
    } catch (e) { toast(e.message, true); }
  }
  async function unpublish() {
    if (!rec.state.live) return;
    if (!confirm(rec.state.assets ? 'Unpublish it? Players get the game’s own again.' : 'Unpublish it? Players will no longer have it.')) return;
    try {
      rec.state = await api(`/c/${rec.kind}/${rec.id}/live`, { method: 'DELETE' });
      // with no draft and nothing unsaved, what players now get is opened: the game's own, or nothing
      if (!rec.state.draft && !changed) {
        const { kind: k, id } = rec, there = rec.state.assets;
        rec = null;
        if (there) { await open(k, id); restartNotice(`${NAMES[k]} ${id} is unpublished: players get the game’s own, which is what is open now.`); } else { draw(); lookup(find.value); restartNotice(`${NAMES[k]} ${id} is unpublished: players no longer have it.`); }
        return;
      }
      drawHead(); lookup(find.value); restartNotice(`${NAMES[rec.kind]} ${rec.id} is unpublished. Your draft is still open here: throw it away to see the game’s own.`);
    } catch (e) { toast(e.message, true); }
  }
  async function exportZip() {
    try { const missing = await exportThing(rec); toast(missing.length ? `Exported, but without ${missing.join(', ')}: not found here.` : 'Exported, with the pictures of yours it uses.', missing.length > 0); } catch (e) { toast(`It could not be exported: ${e.message}`, true); }
  }
  function importZip() {
    if (!leave()) return;
    const input = h('input', { type: 'file', accept: '.zip,application/zip', onchange: async () => {
      const file = input.files[0];
      if (!file) return;
      let z;
      try { z = await readThingZip(file); } catch (e) { toast(`${file.name} can’t be imported: ${e.message}.`, true); return; }
      const id = await askNumber(z);
      if (typeof id !== 'number') return;
      try {
        const notes = await importThing(z, id);
        changed = false;
        kind = z.kind; if (pickKind) for (const b of pickKind.children) b.classList.toggle('on', b.textContent === kinds.find((x) => x[0] === kind)?.[1]);
        await open(z.kind, id);
        dialog(`Imported as ${NAMES[z.kind]} ${id}`, (close) => [
          h('p', null, `It is your draft of ${NAMES[z.kind].toLowerCase()} ${id}, open here. Publish it for players to get it.`),
          notes.length ? h('ul', { class: 'problems' }, notes.map((n) => h('li', null, `${n[0].toUpperCase()}${n.slice(1)}.`))) : null,
          h('div', { class: 'dialog-foot' }, h('button', { type: 'button', class: 'primary', onclick: () => close(true) }, 'OK'))]);
      } catch (e) { toast(`It could not be imported: ${e.message}`, true); }
    } });
    input.click();
  }
  /** Which number a zip's thing is saved as; resolves the number, or nothing. */
  function askNumber(z) {
    const id = h('input', { type: 'number', min: 1, required: true, value: z.id ?? '' });
    const what = h('p', { class: 'muted' }), note = h('p', { class: 'error', role: 'alert' });
    const look = settled(async () => {
      const n = Number(id.value);
      if (id.value === '' || !Number.isInteger(n)) { what.textContent = ''; return; }
      try {
        const s = await api(`/c/${z.kind}/${n}/state`);
        what.textContent = s.draft ? `You have a draft of ${n}: the zip’s takes its place.` : s.assets || s.live ? `${n} is there already: the zip’s becomes your draft of it, and players keep theirs until you publish.` : `Nothing has the number ${n}: the zip’s becomes one of your own.`;
      } catch (e) { what.textContent = e.message; }
    });
    id.addEventListener('input', look);
    setTimeout(() => { id.focus(); look(); }, 0);
    return dialog(`Import ${NAMES[z.kind].toLowerCase()}`, (close) => h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const n = Number(id.value); if (!Number.isInteger(n) || n < 1) { note.textContent = 'Give it a number.'; return; } close(n); } },
      h('p', null, `${z.words?.name || z.tree?.QuestInfo?.name || `${NAMES[z.kind]} ${z.id}`}${z.id ? `, ${z.id} where it was exported` : ''}${z.pictures.size ? `, with ${z.pictures.size} picture${z.pictures.size === 1 ? '' : 's'}` : ''}.`),
      h('label', null, 'Save it as number', id), what, note,
      h('div', { class: 'dialog-foot' }, h('button', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'primary', type: 'submit' }, 'Import'))));
  }

  // ---------------------------------------------------------------- a new one
  function pickPicture(k) {
    return dialog('Which picture?', (close) => {
      const grid = h('div', { class: 'pick-grid' }, h('p', { class: 'empty' }, 'Loading...'));
      api(`/pictures/${k}`).then((pics) => fill(grid, pics.length ? pics.map((p) => h('button', { type: 'button', title: `${p.name} (${p.w} × ${p.h})`, onclick: () => close(p) }, h('img', { alt: '', loading: 'lazy', src: pictureUrl(k, p.name, p.at) }), h('span', null, p.name)))
        : h('p', { class: 'empty' }, 'No pictures have been brought in for these yet. ', h('a', { href: '#import', onclick: () => close(undefined) }, 'Bring some in on the Import tab'), '.')), (e) => toast(e.message, true));
      return grid;
    }, { wide: true });
  }
  const canvasOf = (k, p, origin) => ({ origin, _w: p.w, _h: p.h, _canvas: `_custom/${DIRS[k]}/${p.name}.png` });
  function newOne() {
    if (!leave()) return;
    const k = kind, id = h('input', { type: 'number', required: true, min: 1 }), note = h('p', { class: 'error', role: 'alert' });
    let source = null, picture = null, empty = false;
    const from = h('button', { type: 'button', onclick: async () => { const r = await pickFromList(`A copy of which ${NAMES[k].toLowerCase()}?`, async (q) => (await api(`/c/${k}?q=${encodeURIComponent(q)}`)).map((x) => ({ id: x.id, label: `${x.name || '(no name)'}${x.sub ? `  (${x.sub})` : ''}`, sub: x.sub })));
      if (r) { source = r; picture = null; empty = false; from.textContent = `${r.id} ${r.label}`; if (pic) pic.textContent = k === 'quest' ? 'Start empty' : 'From a picture...'; } } }, 'A copy of...');
    const pic = k === 'npc' ? h('button', { type: 'button', onclick: async () => { const p = await pickPicture('npc'); if (p) { picture = p; source = null; pic.textContent = `The picture ${p.name}`; from.textContent = 'A copy of...'; } } }, 'From a picture...')
      : k === 'quest' ? h('button', { type: 'button', onclick: () => { empty = true; source = null; pic.textContent = 'Starting empty'; from.textContent = 'A copy of...'; } }, 'Start empty') : null;
    const range = k === 'quest' ? 'A quest’s number has up to five digits. Take one the game doesn’t use: you are told if it is taken. A copy of a quest like the one you want is the easiest start: it has everything the game expects of one.'
      : k === 'npc' ? 'An NPC’s number has up to seven digits. Take one the game doesn’t use: you are told if it is taken.'
      : k === 'equip' ? 'An equip’s number has seven digits and starts like the one it copies (a sword 130xxxx, a hat 100xxxx): the first three say what kind of equip it is.'
        : 'An item’s number has seven digits and starts with 2 (use), 3 (set-up), 4 (etc) or 5 (cash); its first three say which of the game’s files it joins.';
    dialog(`A new ${NAMES[k].toLowerCase()}`, (close) => h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      const n = Number(id.value);
      try {
        if (!source && !picture && !empty) { note.textContent = k === 'npc' ? 'Say what it starts as: a copy of an NPC, or a picture.' : k === 'quest' ? 'Say what it starts as: a copy of a quest, or empty.' : 'Say which one it is a copy of.'; return; }
        const there = await api(`/c/${k}/${n}/state`);
        if (there.assets || there.draft || there.live) { note.textContent = `${NAMES[k]} ${n} is there already. Take a free number, or open that one to change it.`; return; }
        const fresh = { assets: false, draft: false, live: false };
        if (source) {
          const src2 = await api(`/c/${k}/${source.id}`);
          if (k === 'equip' && Math.floor(n / 10000) !== Math.floor(source.id / 10000)) { note.textContent = `Its number has to start with ${Math.floor(source.id / 10000)}, as the one it copies does.`; return; }
          close({ id: n, kind: k, tree: src2.tree, words: { ...src2.words }, folder: src2.folder, layout: src2.layout, dialogue: src2.dialogue, state: fresh });
        } else if (empty) close({ id: n, kind: k, tree: EMPTY_QUEST(), words: {}, state: fresh });
        else close({ id: n, kind: k, tree: { info: {}, stand: { 0: { ...canvasOf('npc', picture, [Math.round(picture.w / 2), picture.h]), z: 0, delay: 200 } } }, words: { name: picture.name, func: '' }, state: fresh });
      } catch (err) { note.textContent = err.message; }
    } }, h('label', null, 'Number', id), h('p', { class: 'muted' }, range), h('div', { class: 'side-buttons' }, from, pic), note,
    h('div', { class: 'dialog-foot' }, h('button', { class: 'primary', type: 'submit' }, 'Make it')))).then((made) => { if (made) { show(made); changed = true; draw(); toast('A new one. Save it to keep it.'); } });
  }

  // ---------------------------------------------------------------- the head
  const head = h('div', { class: 'thing-head' });
  function drawHead() {
    if (!rec) { fill(head); return; }
    fill(head, h('h2', null, `${NAMES[rec.kind]} ${rec.id}${rec.kind === 'quest' && rec.tree?.QuestInfo?.name ? `: ${rec.tree.QuestInfo.name}` : rec.words?.name ? `: ${rec.words.name}` : ''}`),
      h('span', { class: `chip${changed ? ' warn' : ''}` }, changed ? 'changes not saved' : rec.state.draft ? 'draft saved' : 'as it was opened'),
      h('span', { class: `chip${rec.state.live ? ' on' : ''}` }, rec.state.live ? 'published' : rec.state.assets ? 'players get the game’s own' : 'not published'),
      rec.kind === 'npc' ? h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which board' }, [['look', 'Looks'], ['dialogue', 'Dialogue']].map(([v, name]) => h('button', {
        type: 'button', class: v === view ? 'on' : null, 'aria-pressed': v === view, onclick: () => { if (view !== v) { view = v; picked = null; board = null; draw(); } } }, name))) : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'primary', onclick: save }, 'Save'), h('button', { type: 'button', onclick: publish, title: 'Write it into the customs folder for the client and the server' }, 'Publish'),
      h('button', { type: 'button', onclick: unpublish, disabled: !rec.state.live, title: rec.state.live ? 'Take it out of the customs folder again' : 'It isn’t published' }, 'Unpublish'),
      h('button', { type: 'button', onclick: exportZip, title: 'Save it, with the pictures of yours it uses, as a zip' }, 'Export zip'),
      h('button', { type: 'button', class: 'quiet', onclick: discard }, 'Throw the draft away'));
  }

  // ---------------------------------------------------------------- what a node holds (beside the board)
  /** Rows to change a node's own values. */
  function fields(node, more) {
    const rows = [];
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('_') || (v !== null && typeof v === 'object')) continue;
      const input = typeof v === 'number'
        ? h('input', { type: 'number', step: 'any', value: v, onchange: (e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) { node[k] = n; touch(); } else e.target.value = node[k]; } })
        : h('input', { type: 'text', value: v, onchange: (e) => { node[k] = e.target.value; touch(); } });
      rows.push(h('label', { class: 'field', title: HINTS[k] || null }, h('span', null, k), input,
        h('button', { type: 'button', class: 'quiet', title: `Take ${k} off`, 'aria-label': `Take ${k} off`, onclick: () => { delete node[k]; touch(); side(); } }, '×')));
    }
    const left = more.filter((k) => !(k in node));
    const adder = left.length ? h('select', { class: 'adder', 'aria-label': 'Add a field', onchange: (e) => { if (!e.target.value) return; node[e.target.value] = 0; touch(); side(); } },
      h('option', { value: '' }, 'Add a field...'), left.map((k) => h('option', { value: k }, `${k}${HINTS[k] ? `  (${HINTS[k]})` : ''}`))) : null;
    const custom = h('input', { type: 'text', placeholder: 'another field’s name', class: 'adder' });
    return h('div', { class: 'fields' }, rows, adder,
      h('form', { class: 'adder-row', onsubmit: (e) => { e.preventDefault(); const k = custom.value.trim(); if (/^[A-Za-z][A-Za-z0-9_]*$/.test(k) && !(k in node)) { node[k] = 0; touch(); side(); } } }, custom, h('button', { type: 'submit' }, 'Add')));
  }
  /** One picture: what it shows, where its point is, and a button to put one of yours in its place. */
  function pictureRow(holder, key, label, origin) {
    const node = holder[key], linked = node && typeof node._uol === 'string';
    const show2 = isCanvas(node) ? h('img', { alt: '', src: src(rec.kind, node) }) : h('span', { class: 'muted' }, linked ? 'the same as another' : 'none');
    const point = isCanvas(node) ? ['x', 'y'].map((axis, i) => h('label', { class: 'mini' }, axis, h('input', { type: 'number', value: node.origin?.[i] ?? 0, title: 'Where its point is in the picture (what is put at its place).',
      onchange: (e) => { node.origin = [...(node.origin || [0, 0])]; node.origin[i] = Number(e.target.value) || 0; touch(); } }))) : null;
    return h('div', { class: 'pic-row' }, h('div', { class: 'pic-frame small' }, show2), h('div', { class: 'pic-what' }, h('strong', null, label),
      isCanvas(node) ? h('span', { class: 'muted' }, `${node._w} × ${node._h}`) : null, h('div', { class: 'pic-point' }, point)),
    h('button', { type: 'button', onclick: async () => {
      const p = await pickPicture(rec.kind);
      if (!p) return;
      const keep = isCanvas(node) ? Object.fromEntries(Object.entries(node).filter(([k]) => !['origin', '_w', '_h', '_canvas', '_at'].includes(k))) : {};
      holder[key] = { ...keep, ...canvasOf(rec.kind, p, origin(p)) };
      touch(); side();
    } }, 'Use a picture...'));
  }
  /** A node of any shape: its values to change, its groups to open, and more to add (`skip`: its keys shown elsewhere). */
  function tree(node, depth = 0, skip = []) {
    const rows = [], keys = Object.keys(node).filter((k) => !k.startsWith('_') && !skip.includes(k));
    const drop = (k) => h('button', { type: 'button', class: 'quiet', title: `Take ${k} off`, 'aria-label': `Take ${k} off`, onclick: (e) => { e.preventDefault(); delete node[k]; if (Array.isArray(node._order)) node._order = node._order.filter((x) => String(x) !== k); touch(); side(); } }, '×');
    for (const k of keys) {
      const v = node[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const n = Object.keys(v).filter((x) => !x.startsWith('_')).length;
        rows.push(h('details', { class: 'group', open: depth < 1 || n <= 4 }, h('summary', null, h('span', { class: 'group-name' }, k), h('span', { class: 'muted' }, n ? `${n} inside` : 'empty'), drop(k)), tree(v, depth + 1)));
      } else if (typeof v === 'number') rows.push(h('label', { class: 'field', title: HINTS[k] || null }, h('span', null, k),
        h('input', { type: 'number', step: 'any', value: v, onchange: (e) => { const x = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(x)) { node[k] = x; touch(); } else e.target.value = node[k]; } }), drop(k)));
      else if (typeof v === 'string') rows.push(h('label', { class: `field${v.length > 40 || v.includes('\n') ? ' long' : ''}` }, h('span', null, k),
        v.length > 40 || v.includes('\n') ? h('textarea', { rows: Math.min(8, 2 + Math.floor(v.length / 70)), value: v, oninput: (e) => { node[k] = e.target.value; touch(); } }) : h('input', { type: 'text', value: v, oninput: (e) => { node[k] = e.target.value; touch(); } }), drop(k)));
    }
    const listy = keys.length > 0 && keys.every((k) => /^\d+$/.test(k)), next = nextKey(node);
    const name = h('input', { type: 'text', placeholder: listy ? next : 'a name', 'aria-label': 'The name of what to add' });
    const type = h('select', { 'aria-label': 'What kind of value' }, h('option', { value: 'number' }, 'a number'), h('option', { value: 'text' }, 'words'), h('option', { value: 'group' }, 'a group'));
    rows.push(h('form', { class: 'adder-row', onsubmit: (e) => {
      e.preventDefault();
      const k = name.value.trim() || (listy ? next : '');
      if (!k || k.startsWith('_') || k in node || skip.includes(k)) { name.focus(); return; }
      node[k] = type.value === 'number' ? 0 : type.value === 'text' ? '' : {};
      touch(); side();
    } }, name, type, h('button', { type: 'submit' }, 'Add')));
    return h('div', { class: 'tree' }, rows);
  }
  const wordsPanel = () => h('div', { class: 'fields' }, Object.keys(rec.words || {}).map((w) => h('label', { class: 'word' }, WORDS[w] || w,
    w === 'desc' ? h('textarea', { rows: 3, value: rec.words[w], oninput: (e) => { rec.words[w] = e.target.value; touch(); } }) : h('input', { type: 'text', value: rec.words[w], maxLength: 100, oninput: (e) => { rec.words[w] = e.target.value; touch(); drawHead(); } }))),
  rec.kind !== 'npc' && rec.kind !== 'quest' ? h('p', { class: 'muted' }, 'In a description, \\n starts a new line.') : null);
  const names = new Map();   // NPCs', items' and monsters' names by kind and number, as they are asked for
  /** A number of something (an NPC, an item, a monster, a quest, a map) with its name, and a button to pick another. */
  function pickRow(label, holder, key, what) {
    const id = Number(holder[key]) || 0, who = h('span', { class: 'muted' }, id ? names.get(`${what}:${id}`) ?? '' : 'none yet');
    const searches = { npc: (q) => api(`/c/npc?q=${encodeURIComponent(q)}`), quest: (q) => api(`/c/quest?q=${encodeURIComponent(q)}`), mob: (q) => api(`/names/mob?q=${encodeURIComponent(q)}`),
      item: async (q) => (await Promise.all(['item', 'equip'].map((k) => api(`/c/${k}?q=${encodeURIComponent(q)}`)))).flat(), map: (q) => api(`/c/map?q=${encodeURIComponent(q)}`) };
    if (id && !names.has(`${what}:${id}`) && searches[what]) searches[what](String(id)).then((rows) => { const r = rows.find((x) => x.id === id); names.set(`${what}:${id}`, r?.name || (what === 'map' ? r?.sub : '') || '(none of that number)'); who.textContent = names.get(`${what}:${id}`); }, () => {});
    return h('div', { class: 'npc-row' }, h('strong', null, label), h('input', { type: 'number', value: id || '', class: 'pick-id', 'aria-label': `${label}: its number`, onchange: (e) => { holder[key] = Number(e.target.value) || 0; touch(); side(); } }), who,
      searches[what] ? h('button', { type: 'button', onclick: async () => { const r = await pickFromList(`Which ${what === 'mob' ? 'monster' : what === 'npc' ? 'NPC' : what}?`, async (q) => (await searches[what](q)).map((x) => ({ id: x.id, label: x.name || x.sub || '(no name)' }))); if (r) { holder[key] = r.id; names.set(`${what}:${r.id}`, r.label); touch(); side(); } } }, 'Pick...') : null);
  }

  // ---------------------------------------------------------------- the boards
  /** A pose's first frames, small (following links: a frame the same as another's, a part from a look). */
  const thumbs = (t, pose, kind2, max = 6) => {
    const pics = [];
    for (const f of numKeys(t[pose]).slice(0, max)) {
      const { fr, chain } = frameAt(t, pose, f);
      const c = isCanvas(fr) ? fr : fr ? Object.values(fr).map((v) => partAt(chain, v).c).find(Boolean) : null;
      if (c) pics.push(h('img', { alt: '', loading: 'lazy', src: src(kind2, c) }));
    }
    return h('div', { class: 'nb-thumbs' }, pics.length ? pics : h('span', { class: 'muted' }, 'no pictures'));
  };
  /** A look's layers, small, each with its depth. */
  const layerThumbs = (t, look) => {
    const ls = layersOf(t, look);
    return h('div', { class: 'nb-thumbs' }, ls.length ? ls.map(([name, c]) => h('img', { alt: '', loading: 'lazy', title: `${name} (${c.z ?? 'no layer'})`, src: src(rec.kind, c) })) : h('span', { class: 'muted' }, 'no pictures'));
  };
  /** Equips and items: the thing, its stats, its icon, and an equip's worn look and poses; an item's effect. */
  function thingSpec() {
    const t = rec.tree, equip = rec.kind === 'equip';
    t.info ??= {};
    const types = {
      thing: { label: NAMES[rec.kind], color: '#2a78d6', outs: () => [{ name: 'stats', label: 'stats', kind: 'stats' }, { name: 'icon', label: 'icon', kind: 'icon' }, ...(equip ? [{ name: 'look', label: 'worn look', kind: 'look' }] : [{ name: 'spec', label: 'when used', kind: 'spec' }])],
        body: () => h('span', null, rec.words?.name || '(no name)') },
      stats: { label: 'Stats', color: '#7a5af5', ins: [{ name: 'in', accepts: ['stats'] }], body: () => { const s = Object.entries(t.info).filter(([, v]) => typeof v === 'number' && v).slice(0, 5); return s.length ? h('div', { class: 'nb-facts' }, s.map(([k, v]) => h('span', null, `${k} ${v}`))) : h('span', { class: 'muted' }, 'none'); } },
      icon: { label: 'Icon', color: '#d97706', ins: [{ name: 'in', accepts: ['icon'] }], body: () => (isCanvas(t.info.icon) ? h('img', { alt: '', class: 'nb-icon', src: src(rec.kind, t.info.icon) }) : h('span', { class: 'muted' }, 'none')) },
      spec: { label: 'When used', color: '#16a34a', ins: [{ name: 'in', accepts: ['spec'] }], deletable: true, body: () => { const s = Object.entries(t.spec || {}).filter(([, v]) => typeof v !== 'object').slice(0, 5); return s.length ? h('div', { class: 'nb-facts' }, s.map(([k, v]) => h('span', null, `${k} ${v}`))) : h('span', { class: 'muted' }, 'does nothing yet'); } },
      look: { label: 'Worn look', color: '#0891b2', ins: [{ name: 'in', accepts: ['look'] }],
        outs: () => [...(looksOf(t).length ? [{ name: 'looks', label: 'looks', kind: 'shared' }] : []), { name: 'poses', label: 'poses', kind: 'pose' }],
        body: () => { const ls = looksOf(t), ps = framePosesOf(t), using = ps.filter((p) => lookUse(t, p)).length; return h('span', { class: 'muted' }, `${ps.length} poses${ls.length ? `, ${using} of them wearing ${ls.length === 1 ? 'its look' : 'one of its looks'}` : ''}`); } },
      shared: { label: 'Look', color: '#0891b2', ins: [{ name: 'in', accepts: ['shared'] }],
        body: (n) => { const users = framePosesOf(t).filter((p) => lookUse(t, p) === n.data.look); return [layerThumbs(t, n.data.look), h('span', { class: 'muted' }, `${layersOf(t, n.data.look).length} layer${layersOf(t, n.data.look).length === 1 ? '' : 's'}; worn in ${users.length} pose${users.length === 1 ? '' : 's'}`), users.length ? h('div', { class: 'nb-chips' }, users.slice(0, 12).map((p) => h('span', { class: 'nb-chip' }, p)), users.length > 12 ? h('span', { class: 'muted' }, `+${users.length - 12}`) : null) : null]; } },
      pose: { label: 'Pose', color: '#0e7490', deletable: true, ins: [{ name: 'in', accepts: ['pose'] }, { name: 'same', label: 'same as', accepts: ['frames'] }], outs: () => [{ name: 'frames', label: 'its frames', kind: 'frames' }],
        body: (n) => { const to = linkOf(t, n.data.pose); return to ? h('span', { class: 'muted' }, `the same as ${to}`) : thumbs(t, n.data.pose, rec.kind, 5); } },
    };
    function build() {
      const nodes = [{ id: 'thing', type: 'thing', title: String(rec.id) }, { id: 'stats', type: 'stats' }, { id: 'icon', type: 'icon' }];
      const wires = [{ from: ['thing', 'stats'], to: ['stats', 'in'], fixed: true }, { from: ['thing', 'icon'], to: ['icon', 'in'], fixed: true }];
      if (equip) {
        nodes.push({ id: 'look', type: 'look' });
        wires.push({ from: ['thing', 'look'], to: ['look', 'in'], fixed: true });
        // its looks (a cap's front and back), each with the poses that wear it shown in it; a pose of its own frames
        // (or the same as another's) is a node of its own
        for (const l of looksOf(t)) {
          nodes.push({ id: `shared:${l}`, type: 'shared', title: `${lookName(l)}  (${l})`, data: { look: l } });
          wires.push({ from: ['look', 'looks'], to: [`shared:${l}`, 'in'], fixed: true });
        }
        const own = framePosesOf(t).filter((p) => !lookUse(t, p));
        for (const p of own) {
          nodes.push({ id: `pose:${p}`, type: 'pose', title: `${p}${POSES[p] ? `  ${POSES[p]}` : ''}`, data: { pose: p } });
          wires.push({ from: ['look', 'poses'], to: [`pose:${p}`, 'in'], fixed: true });
        }
        for (const p of own) { const to = linkOf(t, p); if (to && t[to] && own.includes(to)) wires.push({ from: [`pose:${to}`, 'frames'], to: [`pose:${p}`, 'same'] }); }
      } else if (isObj(t.spec)) { nodes.push({ id: 'spec', type: 'spec' }); wires.push({ from: ['thing', 'spec'], to: ['spec', 'in'], fixed: true }); }
      return { nodes, wires };
    }
    const sameAs = (to, from) => { t[to] = Object.fromEntries(numKeys(t[from]).map((f) => [f, { _uol: `../${from}/${f}` }])); };
    return {
      types, build,
      addable: equip ? [{ type: 'pose', label: 'A pose...' }] : isObj(t.spec) ? [] : [{ type: 'spec', label: 'What using it does' }],
      connect(from, to) {
        const a = from[0].slice(5), b = to[0].slice(5);
        if (!t[a] || !t[b] || a === b) return false;
        if (linkOf(t, a) === b) { toast(`${a} is the same as ${b} already: that would go round in a circle.`, true); return false; }
        if (!numKeys(t[a]).length) { toast(`${a} has no frames to share.`, true); return false; }
        if (!linkOf(t, b) && numKeys(t[b]).length && !confirm(`${b} has frames of its own. Make it the same as ${a} instead (its own frames are dropped)?`)) return false;
        sameAs(b, a);
        return true;
      },
      disconnect(w) { const b = w.to[0].slice(5); t[b] = ownFrames(t, b); return true; },
      remove(id) {
        if (id === 'spec') { if (!confirm('Take off what using it does?')) return false; delete t.spec; return true; }
        const p = id.slice(5);
        if (!confirm(`Take the pose ${p} off? It won’t show in that pose any more.`)) return false;
        for (const q of posesOf(t)) if (linkOf(t, q) === p) t[q] = ownFrames(t, q);   // (those the same as it keep its frames)
        delete t[p];
        return true;
      },
      async add(type) {
        if (type === 'spec') { t.spec = {}; return 'spec'; }
        const choose = h('select', null, Object.keys(POSES).filter((p) => !t[p]).map((p) => h('option', { value: p }, `${p}  ${POSES[p]}`)));
        const front = looksOf(t).includes('default') ? 'default' : looksOf(t)[0];
        const p = await dialog('Which pose?', (close) => h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); close(choose.value); } },
          h('label', null, 'Pose', choose), h('p', { class: 'muted' }, front ? `It starts wearing the ${lookName(front)}, as the rest do.` : t.stand1 ? 'It starts as the same as stand1: cut that wire to give it frames of its own.' : 'It starts with one empty frame.'),
          h('div', { class: 'dialog-foot' }, h('button', { class: 'primary', type: 'submit' }, 'Add it'))));
        if (!p) return null;
        if (front) { useLook(t, p, front, numKeys(t.stand1).length || 1); return `shared:${front}`; }
        if (t.stand1 && numKeys(t.stand1).length) sameAs(p, 'stand1'); else t[p] = { 0: {} };
        return `pose:${p}`;
      },
      inspect(id) {
        if (!id || id === 'thing') return [h('h3', null, NAMES[rec.kind]), wordsPanel(), preview ? h('h3', null, 'Worn') : null, preview?.el,
          h('p', { class: 'muted' }, equip ? 'Pick a pose to change how it looks in it: each frame’s parts, their pictures and how they sit on the character.' : 'Pick a node to change it.')];
        if (id === 'stats') return [h('h3', null, `Stats (info)${rec.folder ? `, a ${rec.folder}` : ''}`), fields(t.info, MORE[rec.kind] || [])];
        if (id === 'icon') return [h('h3', null, 'Icon'), pictureRow(t.info, 'icon', 'icon', (p) => [0, p.h]), pictureRow(t.info, 'iconRaw', 'iconRaw', (p) => [0, p.h]),
          h('p', { class: 'muted' }, 'The game keeps two of every icon, icon and iconRaw; give both the same picture unless you have two. An icon is 32 by 32 or a little less.')];
        if (id === 'spec') return [h('h3', null, 'What using it does (spec)'), fields(t.spec, MORE.spec)];
        if (id === 'look') return [h('h3', null, 'Worn look'), preview?.el, looksOf(t).length
          ? h('p', { class: 'muted' }, 'Its pictures are kept in its looks (a cap’s front look and back look), each a picture or a few in layers; its poses wear them. Pick a look to change its layers and which poses wear it. A pose given frames of its own is a node of its own.')
          : h('p', { class: 'muted' }, 'Each pose is a node: add one from Add, wire a pose’s frames into another’s “same as” to share them, and pick one to change its frames.')];
        if (id.startsWith('shared:')) return lookInspector(id.slice(7));
        return poseInspector(id.slice(5));
      },
      selectedPose: () => (picked?.startsWith('pose:') ? picked.slice(5) : null),
    };
  }
  /** The layer names the character has (Base/zmap.img), for a part's layer box to offer. */
  const zList = () => { const zs = h('datalist', { id: `z-${rec.id}-${Math.random().toString(36).slice(2, 8)}` }); zLayers().then((list2) => fill(zs, list2.map((z) => h('option', { value: z })))); return zs; };
  /** One part (a picture in a frame, or a layer of a look): its picture and point, its layer, the points it is joined by. */
  function partEditor(holder, name, c, zs, remove = null) {
    return h('div', { class: 'part' }, pictureRow(holder, name, name, (pic) => [Math.round(pic.w / 2), Math.round(pic.h / 2)]),
      h('label', { class: 'field' }, h('span', null, 'layer'), h('input', { type: 'text', list: zs.id, value: c.z ?? '', title: 'Which layer of the character it is drawn in (Base/zmap.img): what it is drawn over and under.', onchange: (e) => { c.z = e.target.value; touch(); } })),
      Object.entries(c.map || {}).map(([pt, xy]) => h('div', { class: 'pic-point' }, h('span', { class: 'mini' }, pt), ['x', 'y'].map((axis, i) => h('label', { class: 'mini' }, axis, h('input', { type: 'number', value: xy?.[i] ?? 0, onchange: (e) => { c.map[pt] = [...(c.map[pt] || [0, 0])]; c.map[pt][i] = Number(e.target.value) || 0; touch(); } }))),
        h('button', { type: 'button', class: 'quiet', 'aria-label': `Take ${pt} off`, onclick: () => { delete c.map[pt]; touch(); side(); } }, '×'))),
      h('select', { class: 'adder', 'aria-label': 'Join it by another point', onchange: (e) => { if (!e.target.value) return; c.map ??= {}; c.map[e.target.value] = [0, 0]; touch(); side(); } },
        h('option', { value: '' }, 'Join it by a point...'), POINTS.filter((pt) => !c.map?.[pt]).map((pt) => h('option', { value: pt }, pt))),
      remove ? h('button', { type: 'button', class: 'quiet danger', onclick: remove }, `Take ${name} off`) : null);
  }
  /** Where a link of a part leads, in words: "the front look's default". */
  const fromWords = (from) => { const [k, part] = String(from).split('/'); return part !== undefined ? `the ${lookName(k)}’s ${part}` : from; };

  /** An equip's look (a cap's front or back look): its layers, and the poses that wear it. */
  function lookInspector(l) {
    const t = rec.tree;
    if (!t[l]) return [];
    const zs = zList(), wearers = framePosesOf(t).filter((p) => lookUse(t, p) === l), others = looksOf(t).filter((x) => x !== l), own = framePosesOf(t).filter((p) => !lookUse(t, p));
    const out = [h('h3', null, `${lookName(l)} (${l})`), preview?.el,
      h('p', { class: 'muted' }, l === 'backDefault' ? 'How it looks from behind, worn on a ladder or a rope.' : 'How it looks, in every pose that wears it.'),
      h('h4', null, `Its layers (${layersOf(t, l).length})`)];
    for (const [name, c] of layersOf(t, l)) out.push(h('div', { class: 'frame-card' }, partEditor(t[l], name, c, zs, layersOf(t, l).length > 1 ? () => removeLayer(l, name) : null)));
    out.push(h('form', { class: 'adder-row', onsubmit: async (e) => {
      e.preventDefault();
      const name = e.target.elements.layer.value.trim();
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || t[l][name]) { e.target.elements.layer.focus(); return; }
      const pic = await pickPicture(rec.kind);
      if (!pic) return;
      const first = layersOf(t, l)[0]?.[1];
      t[l][name] = { ...canvasOf(rec.kind, pic, [Math.round(pic.w / 2), Math.round(pic.h / 2)]), map: structuredClone(first?.map || { brow: [0, 0] }), z: first?.z ?? 'capOverHair' };
      for (const p of wearers) for (const f of numKeys(t[p])) t[p][f][name] = partLink(l, name);   // (every pose that wears the look wears it too)
      touch(); showBoard(); side();
    } }, h('input', { type: 'text', name: 'layer', placeholder: 'a new layer’s name (defaultAc...)' }), h('button', { type: 'submit' }, 'Add a layer')), zs);
    out.push(h('h4', null, `Worn in ${wearers.length} pose${wearers.length === 1 ? '' : 's'}`),
      wearers.length ? h('div', { class: 'wearers' }, wearers.map((p) => h('div', { class: 'wearer' }, h('span', null, p, POSES[p] ? h('span', { class: 'muted' }, `  ${POSES[p]}`) : null),
        others.map((o) => h('button', { type: 'button', class: 'quiet', title: `It wears the ${lookName(o)} instead`, onclick: () => { useLook(t, p, o); touch(); showBoard(); side(); } }, `Wear the ${lookName(o)}`)),
        h('button', { type: 'button', class: 'quiet', title: 'Its frames become copies of their own, to change for this pose', onclick: () => { t[p] = ownFramesDeep(t, p); picked = `pose:${p}`; touch(); showBoard(); side(); } }, 'Own frames')))) : h('p', { class: 'muted' }, 'No pose wears it.'),
      own.length ? h('details', { class: 'group' }, h('summary', null, h('span', { class: 'group-name' }, `Poses with frames of their own (${own.length})`)),
        own.map((p) => h('div', { class: 'wearer' }, h('span', null, p), h('button', { type: 'button', class: 'quiet', onclick: () => { if (!confirm(`${p} drops its own frames and wears the ${lookName(l)}. Go on?`)) return; useLook(t, p, l); touch(); showBoard(); side(); } }, `Wear the ${lookName(l)}`)))) : null,
      h('p', { class: 'muted' }, 'A layer is drawn at its depth: capOverHair over the hair, cap under it, capBelowAccessory under face and eye accessories, backCap from behind... A cap is joined to the head by its brow point.'));
    return out;
  }
  function removeLayer(l, name) {
    const t = rec.tree;
    if (!confirm(`Take the layer ${name} off the ${lookName(l)}? The poses that wear it lose it too.`)) return;
    delete t[l][name];
    for (const p of framePosesOf(t)) for (const f of numKeys(t[p])) { const fr = t[p][f]; if (fr?.[name]?._uol === `../../${l}/${name}`) delete fr[name]; }
    touch(); showBoard(); side();
  }

  /** An equip's pose: its frames, each with its parts (a part may be a link to one of its looks' layers). */
  function poseInspector(p) {
    const t = rec.tree, frames = t[p];
    if (!frames) return [];
    const to = linkOf(t, p), looks = looksOf(t);
    const out = [h('h3', null, `${p}${POSES[p] ? `  (${POSES[p]})` : ''}`), preview?.el];
    if (to) return [...out, h('p', null, `It is the same as ${to}: it has ${to}’s frames.`), h('button', { type: 'button', onclick: () => { t[p] = ownFrames(t, p); touch(); showBoard(); side(); } }, 'Give it frames of its own')];
    if (looks.length) out.push(h('div', { class: 'side-buttons' }, looks.map((l) => h('button', { type: 'button', title: 'Its own frames are dropped', onclick: () => { if (!confirm(`${p} drops its own frames and wears the ${lookName(l)}. Go on?`)) return; useLook(t, p, l); picked = `shared:${l}`; touch(); showBoard(); side(); } }, `Wear the ${lookName(l)} instead`))));
    const zs = zList();
    numKeys(frames).forEach((f) => {
      const fr = frames[f];
      if (!isObj(fr)) return;
      if (typeof fr._uol === 'string') { out.push(h('div', { class: 'frame-card' }, h('strong', null, `Frame ${f}`), h('span', { class: 'muted' }, ` the same as ${fr._uol.replace(/^\.\.\//, '')}`))); return; }
      const parts = Object.entries(fr).filter(([, v]) => isObj(v));
      out.push(h('div', { class: 'frame-card' }, h('div', { class: 'frame-head' }, h('strong', null, `Frame ${f}`),
        h('button', { type: 'button', class: 'quiet', onclick: () => { frames[nextKey(frames)] = structuredClone(fr); touch(); side(); } }, 'Copy it'),
        h('button', { type: 'button', class: 'quiet danger', onclick: () => { if (numKeys(frames).length < 2) { toast('A pose keeps one frame at least: take the pose off instead.', true); return; } delete frames[f]; renumber(frames); touch(); side(); } }, 'Take it off')),
      parts.map(([name, v]) => {
        if (isCanvas(v)) return partEditor(fr, name, v, zs, () => { delete fr[name]; touch(); side(); });
        const { c, from } = partAt([t, frames, fr], v);
        return h('div', { class: 'part' }, h('div', { class: 'pic-row' }, h('div', { class: 'pic-frame small' }, c ? h('img', { alt: '', src: src(rec.kind, c) }) : h('span', { class: 'muted' }, 'none')),
          h('div', { class: 'pic-what' }, h('strong', null, name), h('span', { class: 'muted' }, `from ${fromWords(from)}`), c ? h('span', { class: 'muted' }, `${c._w} × ${c._h}, layer ${c.z ?? '-'}`) : null)),
        h('div', { class: 'side-buttons' }, h('button', { type: 'button', disabled: !c, title: 'A copy of it, for this frame alone, to change', onclick: () => { fr[name] = structuredClone(c); touch(); side(); } }, 'Give it its own picture'),
          h('button', { type: 'button', class: 'quiet danger', onclick: () => { delete fr[name]; touch(); side(); } }, `Take ${name} off`)));
      }),
      h('form', { class: 'adder-row', onsubmit: async (e) => {
        e.preventDefault();
        const name = e.target.elements.part.value.trim();
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || fr[name]) { e.target.elements.part.focus(); return; }
        const pic = await pickPicture(rec.kind);
        if (!pic) return;
        fr[name] = { ...canvasOf(rec.kind, pic, [Math.round(pic.w / 2), Math.round(pic.h / 2)]), map: { navel: [0, 0] }, z: name };
        touch(); side();
      } }, h('input', { type: 'text', name: 'part', placeholder: 'a part’s name (mail, weapon...)' }), h('button', { type: 'submit' }, 'Add a part'))));
    });
    out.push(zs, h('button', { type: 'button', onclick: () => { const last = numKeys(frames).pop(); frames[nextKey(frames)] = last ? structuredClone(frames[last]) : {}; touch(); side(); } }, 'Add a frame'),
      h('p', { class: 'muted' }, 'A part’s point (x, y) is where it is held in its picture; each “join” point is put on the same point of the character (the body’s navel, the hand, the brow...). The layer says what it is drawn over and under.'));
    return out;
  }
  /** Numbers a pose's frames 0, 1, 2... again after one is taken out. */
  function renumber(frames) {
    const list2 = numKeys(frames).map((k) => frames[k]);
    for (const k of numKeys(frames)) delete frames[k];
    list2.forEach((v, i) => { frames[i] = v; });
  }

  /** An NPC's looks: it, its settings, its poses and their frames. */
  function npcLookSpec() {
    const t = rec.tree;
    t.info ??= {};
    const types = {
      npc: { label: 'NPC', color: '#2a78d6', outs: () => [{ name: 'info', label: 'settings', kind: 'info' }, { name: 'poses', label: 'poses', kind: 'pose' }], body: () => h('span', null, rec.words?.name || '(no name)') },
      info: { label: 'Settings', color: '#7a5af5', ins: [{ name: 'in', accepts: ['info'] }], body: () => h('span', { class: 'muted' }, `${Object.keys(t.info).filter((k) => !k.startsWith('_')).length} settings`) },
      pose: { label: 'Pose', color: '#0e7490', deletable: true, ins: [{ name: 'in', accepts: ['pose'] }, { name: 'same', label: 'same as', accepts: ['frames'] }], outs: () => [{ name: 'frames', label: 'its frames', kind: 'frames' }],
        body: (n) => { const to = linkOf(t, n.data.pose); return to ? h('span', { class: 'muted' }, `the same as ${to}`) : thumbs(t, n.data.pose, 'npc', 5); } },
    };
    const build = () => {
      const nodes = [{ id: 'npc', type: 'npc', title: String(rec.id) }, { id: 'info', type: 'info' }], wires = [{ from: ['npc', 'info'], to: ['info', 'in'], fixed: true }];
      for (const p of posesOf(t)) { nodes.push({ id: `pose:${p}`, type: 'pose', title: p, data: { pose: p } }); wires.push({ from: ['npc', 'poses'], to: [`pose:${p}`, 'in'], fixed: true }); }
      for (const p of posesOf(t)) { const to = linkOf(t, p); if (to && t[to]) wires.push({ from: [`pose:${to}`, 'frames'], to: [`pose:${p}`, 'same'] }); }
      return { nodes, wires };
    };
    return {
      types, build, addable: [{ type: 'pose', label: 'A pose...' }],
      connect(from, to) {
        const a = from[0].slice(5), b = to[0].slice(5);
        if (!t[a] || !t[b] || a === b || linkOf(t, a) === b) return false;
        if (!linkOf(t, b) && numKeys(t[b]).length && !confirm(`${b} has frames of its own. Make it the same as ${a} instead?`)) return false;
        t[b] = Object.fromEntries(numKeys(t[a]).map((f) => [f, { _uol: `../${a}/${f}` }]));
        return true;
      },
      disconnect(w) { const b = w.to[0].slice(5); t[b] = ownFrames(t, b); return true; },
      remove(id) { const p = id.slice(5); if (!confirm(`Take the pose ${p} off?`)) return false; for (const q of posesOf(t)) if (linkOf(t, q) === p) t[q] = ownFrames(t, q); delete t[p]; return true; },
      async add() {
        const name = h('input', { type: 'text', required: true, placeholder: 'stand, move, say0...' });
        const p = await dialog('A new pose', (close) => h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const v = name.value.trim(); if (/^[A-Za-z][A-Za-z0-9_]*$/.test(v) && !t[v] && v !== 'info') close(v); else name.focus(); } },
          h('label', null, 'Its name', name), h('p', { class: 'muted' }, 'An NPC stands in stand; others (move, say0...) are played now and then, as their names say.'), h('div', { class: 'dialog-foot' }, h('button', { class: 'primary', type: 'submit' }, 'Add it'))));
        if (!p) return null;
        const pic = await pickPicture('npc');
        t[p] = pic ? { 0: { ...canvasOf('npc', pic, [Math.round(pic.w / 2), pic.h]), delay: 200 } } : t.stand ? structuredClone(ownFrames(t, 'stand')) : { 0: {} };
        return `pose:${p}`;
      },
      inspect(id) {
        if (!id || id === 'npc') return [h('h3', null, 'NPC'), wordsPanel(), h('p', { class: 'muted' }, 'What it says when talked to is on its Dialogue board. Put it on a map in the map editor.')];
        if (id === 'info') return [h('h3', null, 'Settings (info)'), fields(t.info, MORE.npc)];
        const p = id.slice(5), frames = t[p], to = linkOf(t, p);
        if (!frames) return [];
        if (to) return [h('h3', null, p), h('p', null, `It is the same as ${to}.`), h('button', { type: 'button', onclick: () => { t[p] = ownFrames(t, p); touch(); showBoard(); side(); } }, 'Give it frames of its own')];
        return [h('h3', null, p), numKeys(frames).map((f) => h('div', { class: 'frame-card' }, pictureRow(frames, f, `Frame ${f}`, (pic) => [Math.round(pic.w / 2), pic.h]),
          isCanvas(frames[f]) ? h('label', { class: 'field' }, h('span', null, 'delay'), h('input', { type: 'number', value: frames[f].delay ?? 100, title: 'How long it shows, in milliseconds.', onchange: (e) => { frames[f].delay = Number(e.target.value) || 0; touch(); } })) : null,
          h('div', { class: 'side-buttons' }, h('button', { type: 'button', class: 'quiet', onclick: () => { frames[nextKey(frames)] = structuredClone(frames[f]); touch(); side(); } }, 'Copy it'),
            h('button', { type: 'button', class: 'quiet danger', onclick: () => { if (numKeys(frames).length < 2) { toast('A pose keeps one frame at least.', true); return; } delete frames[f]; renumber(frames); touch(); side(); } }, 'Take it off')))),
        h('button', { type: 'button', onclick: async () => { const pic = await pickPicture('npc'); if (!pic) return; frames[nextKey(frames)] = { ...canvasOf('npc', pic, [Math.round(pic.w / 2), pic.h]), delay: 200 }; touch(); side(); } }, 'Add a frame from a picture...'),
        h('p', { class: 'muted' }, 'An NPC stands on its point: the middle of the picture’s bottom edge for one you bring in.')];
      },
    };
  }

  /** An NPC's dialogue: a graph that is its own (rec.dialogue), made into its script when published. */
  function dialogueSpec() {
    const g = rec.dialogue;
    const flowIn = [{ name: 'in', accepts: ['flow'] }];
    const text = (n) => h('span', { class: 'nb-text' }, String(n.data?.text || '').slice(0, 90) || '(nothing yet)');
    const types = {
      start: { label: 'Start', color: '#16a34a', outs: () => [{ name: 'next', label: 'talked to', kind: 'flow' }], body: () => h('span', { class: 'muted' }, 'a player talks to it') },
      say: { label: 'Say', color: '#2a78d6', deletable: true, ins: flowIn, outs: () => [{ name: 'next', label: 'Next', kind: 'flow' }], body: text },
      ask: { label: 'Yes or no', color: '#0891b2', deletable: true, ins: flowIn, outs: () => [{ name: 'yes', label: 'Yes', kind: 'flow' }, { name: 'no', label: 'No', kind: 'flow' }], body: text },
      choice: { label: 'Choice', color: '#7a5af5', deletable: true, ins: flowIn, outs: (n) => (n.data?.options || []).map((o, i) => ({ name: `o${i}`, label: o || `option ${i + 1}`, kind: 'flow' })), body: text },
      check: { label: 'Check', color: '#d97706', deletable: true, ins: flowIn, outs: () => [{ name: 'yes', label: 'yes', kind: 'flow' }, { name: 'no', label: 'no', kind: 'flow' }],
        body: (n) => h('span', null, CHECKS[n.data?.what] ? `${CHECKS[n.data.what].label} ${[n.data.id, n.data.n].filter((x) => x !== undefined && x !== '').join(' × ')}` : 'tests nothing yet') },
      act: { label: 'Action', color: '#db2777', deletable: true, ins: flowIn, outs: () => [{ name: 'next', label: 'then', kind: 'flow' }],
        body: (n) => h('span', null, ACTS[n.data?.what] ? `${ACTS[n.data.what].label}: ${[n.data.id, n.data.n, n.data.portal].filter((x) => x !== undefined && x !== '' && x !== null).join(' ')}` : 'does nothing yet') },
      end: { label: 'End', color: '#6b7280', deletable: true, ins: flowIn, body: () => h('span', { class: 'muted' }, 'the talk ends') },
    };
    const fresh = { say: { text: '' }, ask: { text: '' }, choice: { text: '', options: ['', ''] }, check: { what: 'level', n: 10 }, act: { what: 'item', id: 0, n: 1 }, end: {} };
    const node = (id) => g.nodes.find((n) => n.id === id);
    const nid = () => { let i = g.nodes.length + 1; while (node(`n${i}`)) i++; return `n${i}`; };
    return {
      types, kept: true,
      build: () => ({ nodes: g.nodes.map((n) => ({ ...n, title: '' })), wires: g.wires }),
      addable: [['say', 'Say a line'], ['ask', 'Ask yes or no'], ['choice', 'Give a choice'], ['check', 'Check something'], ['act', 'Do something'], ['end', 'End the talk']].map(([type, label]) => ({ type, label })),
      move(id, x, y) { const n = node(id); if (n) { n.x = x; n.y = y; } },
      connect(from, to) { g.wires = g.wires.filter((w) => !(w.from[0] === from[0] && w.from[1] === from[1])); g.wires.push({ from, to }); return true; },
      disconnect(w) { g.wires = g.wires.filter((x) => x !== w && !(x.from[0] === w.from[0] && x.from[1] === w.from[1] && x.to[0] === w.to[0])); return true; },
      remove(id) { g.nodes = g.nodes.filter((n) => n.id !== id); g.wires = g.wires.filter((w) => w.from[0] !== id && w.to[0] !== id); return true; },
      add(type, x, y) { const id = nid(); g.nodes.push({ id, type, x, y, data: structuredClone(fresh[type] || {}) }); return id; },
      inspect(id) {
        const n = id && node(id);
        if (!n || n.type === 'start') {
          const made = compileDialogue(g, rec.id);
          return [h('h3', null, 'Dialogue'), h('p', { class: 'muted' }, 'What happens when a player talks to it: add nodes from Add (or a right click on the board) and wire each way out to what comes next. A line with nothing after it ends the talk with OK.'),
            made.problems.length ? h('ul', { class: 'problems' }, made.problems.map((p) => h('li', { class: 'bad' }, p))) : h('p', null, 'Nothing wrong found.'),
            h('button', { type: 'button', onclick: () => dialog('Its script', () => h('pre', { class: 'script' }, made.script || 'Nothing yet: wire something to the start.'), { wide: true }) }, 'Show the script'),
            h('p', { class: 'muted' }, 'Publishing writes it into the customs folder as the NPC’s script (customs/scripts/npc), which Voyage-Server runs in place of a script of its own for it.')];
        }
        const d = n.data ??= {};
        const say = (label) => h('label', { class: 'word' }, label, h('textarea', { rows: 4, value: d.text || '', oninput: (e) => { d.text = e.target.value; touch(); } }),
          h('span', { class: 'muted' }, '#b blue #k black, #r red, #e bold, #n plain; #t2000000# an item’s name, #i2000000# its picture.'));
        if (n.type === 'say') return [h('h3', null, 'Say a line'), say('What it says')];
        if (n.type === 'ask') return [h('h3', null, 'Ask yes or no'), say('What it asks')];
        if (n.type === 'end') return [h('h3', null, 'End the talk'), h('p', { class: 'muted' }, 'The window closes.')];
        if (n.type === 'choice') {
          d.options ??= [];
          return [h('h3', null, 'Give a choice'), say('What it says above the choices'), h('div', { class: 'fields' }, d.options.map((o, i) => h('label', { class: 'field' }, h('span', null, `option ${i + 1}`),
            h('input', { type: 'text', value: o, oninput: (e) => { d.options[i] = e.target.value; touch(); } }),
            h('button', { type: 'button', class: 'quiet', 'aria-label': `Take option ${i + 1} off`, onclick: () => {
              d.options.splice(i, 1);
              g.wires = g.wires.filter((w) => !(w.from[0] === n.id && w.from[1] === `o${i}`)).map((w) => { const m = w.from[0] === n.id && /^o(\d+)$/.exec(w.from[1]); return m && Number(m[1]) > i ? { ...w, from: [n.id, `o${Number(m[1]) - 1}`] } : w; });
              touch(); showBoard(); side();
            } }, '×'))),
          h('button', { type: 'button', onclick: () => { d.options.push(''); touch(); showBoard(); side(); } }, 'Add an option'))];
        }
        const KIND = n.type === 'check' ? CHECKS : ACTS, k = KIND[d.what] || {};
        const pickWhat = { item: 'item', canHold: 'item', questStarted: 'quest', questDone: 'quest', startQuest: 'quest', completeQuest: 'quest', warp: 'map' }[d.what];
        return [h('h3', null, n.type === 'check' ? 'Check something' : 'Do something'),
          h('label', { class: 'field' }, h('span', null, n.type === 'check' ? 'tests' : 'does'), h('select', { onchange: (e) => { d.what = e.target.value; touch(); side(); } },
            Object.entries(KIND).map(([key, v]) => h('option', { value: key, selected: key === d.what }, v.label)))),
          k.id ? pickRow(k.id, d, 'id', pickWhat || 'item') : null,
          k.n ? h('label', { class: 'field' }, h('span', null, k.n), h('input', { type: 'number', value: d.n ?? 0, onchange: (e) => { d.n = Number(e.target.value) || 0; touch(); } })) : null,
          k.portal ? h('label', { class: 'field' }, h('span', null, 'portal'), h('input', { type: 'text', value: d.portal || '', placeholder: 'sp (optional)', onchange: (e) => { d.portal = e.target.value.trim(); touch(); } })) : null,
          n.type === 'check' ? h('p', { class: 'muted' }, 'Wire its yes and its no to what comes next in each case.') : null];
      },
    };
  }

  /** A quest as a flow: from the NPC that gives it to what finishing it gives, with what it needs and gives wired in. */
  function questSpec() {
    const q = rec.tree;
    for (const part of ['QuestInfo', 'Check', 'Act', 'Say']) if (!isObj(q[part])) q[part] = {};
    for (const part of ['Check', 'Act', 'Say']) for (const end of ['0', '1']) if (!isObj(q[part][end])) q[part][end] = {};
    rec.layout.loose = Array.isArray(rec.layout.loose) ? rec.layout.loose : [];
    const loose = rec.layout.loose;
    const FLOW = [['quest', 'Quest'], ['startNpc', 'Given by'], ['startNeeds', 'To start'], ['startSay', 'Start lines'], ['startGives', 'Starting gives'], ['endNpc', 'Handed in to'], ['endNeeds', 'To finish'], ['endSay', 'End lines'], ['endGives', 'Finishing gives']];
    /** Where each kind of piece is kept, in which part and end. */
    const LISTS = { needItem: [['Check', '0', 'item', 'startNeeds'], ['Check', '1', 'item', 'endNeeds']], needMob: [['Check', '1', 'mob', 'endNeeds']], needQuest: [['Check', '0', 'quest', 'startNeeds']], giveItem: [['Act', '0', 'item', 'startGives'], ['Act', '1', 'item', 'endGives']] };
    const PIECE = { needItem: ['Item to bring', 'item', '#d97706'], needMob: ['Monster to hunt', 'mob', '#dc2626'], needQuest: ['Quest needed', 'quest', '#7a5af5'], giveItem: ['Item given', 'item', '#16a34a'] };
    const PORT = { needItem: 'items', needMob: 'mobs', needQuest: 'quests', giveItem: 'items' };
    const pieceName = (type, d) => { const what = PIECE[type][1], name = names.get(`${what}:${d.id}`); if (d.id && !names.has(`${what}:${d.id}`)) lookupName(what, d.id); return `${d.id || '?'}${name ? ` ${name}` : ''}${d.count !== undefined ? ` × ${d.count}` : ''}${type === 'needQuest' ? ` (${['not started', 'under way', 'done'][d.state] ?? 'done'})` : ''}`; };
    const asked = new Set();
    function lookupName(what, id) {
      const key = `${what}:${id}`;
      if (asked.has(key)) return;
      asked.add(key);
      const search = what === 'mob' ? api(`/names/mob?q=${id}`) : what === 'quest' ? api(`/c/quest?q=${id}`) : Promise.all(['item', 'equip'].map((k) => api(`/c/${k}?q=${id}`))).then((r) => r.flat());
      search.then((rows) => { names.set(key, rows.find((r) => r.id === Number(id))?.name || ''); soon(); }, () => {});
    }
    const summary = (o, skip) => { const s = Object.entries(o).filter(([k, v]) => !skip.includes(k) && typeof v !== 'object' && !k.startsWith('_')).slice(0, 4); return s.length ? h('div', { class: 'nb-facts' }, s.map(([k, v]) => h('span', null, `${k} ${v}`))) : null; };
    const types = {
      quest: { label: 'Quest', color: '#2a78d6', outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => h('span', null, q.QuestInfo.name || '(no name)') },
      startNpc: { label: 'Given by', color: '#0891b2', ins: [{ name: 'in', accepts: ['flowQ'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => h('span', null, `NPC ${q.Check[0].npc || '?'}`) },
      startNeeds: { label: 'To start', color: '#d97706', ins: [{ name: 'in', accepts: ['flowQ'] }, { name: 'items', label: 'items', accepts: ['needItem'] }, { name: 'quests', label: 'quests', accepts: ['needQuest'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => summary(q.Check[0], ['npc']) || h('span', { class: 'muted' }, 'anyone') },
      startSay: { label: 'Start lines', color: '#2563eb', ins: [{ name: 'in', accepts: ['flowQ'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => h('span', { class: 'nb-text' }, String(q.Say[0][numKeys(q.Say[0])[0]] || '').slice(0, 90) || '(nothing)') },
      startGives: { label: 'Starting gives', color: '#16a34a', ins: [{ name: 'in', accepts: ['flowQ'] }, { name: 'items', label: 'items', accepts: ['giveItem'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => summary(q.Act[0], ['item']) || h('span', { class: 'muted' }, 'nothing') },
      endNpc: { label: 'Handed in to', color: '#0891b2', ins: [{ name: 'in', accepts: ['flowQ'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => h('span', null, `NPC ${q.Check[1].npc || '?'}`) },
      endNeeds: { label: 'To finish', color: '#d97706', ins: [{ name: 'in', accepts: ['flowQ'] }, { name: 'items', label: 'items', accepts: ['needItem'] }, { name: 'mobs', label: 'monsters', accepts: ['needMob'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => summary(q.Check[1], ['npc']) || h('span', { class: 'muted' }, 'nothing') },
      endSay: { label: 'End lines', color: '#2563eb', ins: [{ name: 'in', accepts: ['flowQ'] }], outs: () => [{ name: 'next', label: '', kind: 'flowQ' }], body: () => h('span', { class: 'nb-text' }, String(q.Say[1][numKeys(q.Say[1])[0]] || '').slice(0, 90) || '(nothing)') },
      endGives: { label: 'Finishing gives', color: '#16a34a', ins: [{ name: 'in', accepts: ['flowQ'] }, { name: 'items', label: 'items', accepts: ['giveItem'] }], body: () => summary(q.Act[1], ['item']) || h('span', { class: 'muted' }, 'nothing') },
    };
    for (const [type, [label, , color]] of Object.entries(PIECE)) types[type] = { label, color, deletable: true, outs: () => [{ name: 'to', label: 'wire in', kind: type }], body: (n) => h('span', null, pieceName(type, n.data)) };
    const attached = () => {
      const out = [];
      for (const [type, places] of Object.entries(LISTS)) for (const [part, end, key, parent] of places) {
        const listNode = q[part][end][key];
        if (!isObj(listNode)) continue;
        for (const k of numKeys(listNode)) if (isObj(listNode[k])) out.push({ id: `${type}:${part}:${end}:${key}:${k}`, type, data: listNode[k], parent, place: [part, end, key, k] });
      }
      return out;
    };
    const build = () => {
      const nodes = FLOW.map(([id]) => ({ id, type: id })), wires = [];
      for (let i = 0; i < FLOW.length - 1; i++) wires.push({ from: [FLOW[i][0], 'next'], to: [FLOW[i + 1][0], 'in'], fixed: true });
      for (const a of attached()) { nodes.push({ id: a.id, type: a.type, data: a.data }); wires.push({ from: [a.id, 'to'], to: [a.parent, PORT[a.type]] }); }
      for (const l of loose) nodes.push({ id: l.id, type: l.type, data: l.data });
      return { nodes, wires };
    };
    const find2 = (id) => attached().find((a) => a.id === id) || null;
    const detach = (a) => { delete q[a.place[0]][a.place[1]][a.place[2]][a.place[3]]; };
    const attach = (type, data, parent) => {
      const place = LISTS[type].find((p) => p[3] === parent);
      if (!place) return false;
      const holder = q[place[0]][place[1]], listNode = isObj(holder[place[2]]) ? holder[place[2]] : (holder[place[2]] = {});
      listNode[nextKey(listNode)] = data;
      return true;
    };
    const freshPiece = { needItem: { id: 0, count: 1 }, needMob: { id: 0, count: 1 }, needQuest: { id: 0, state: 2 }, giveItem: { id: 0, count: 1 } };
    /** Where a quest's nodes go before they are moved: its start on one row, its end on the next, each step's pieces by it. */
    const ROW = { quest: [0, 0], startNpc: [280, 0], startNeeds: [560, 0], startSay: [840, 0], startGives: [1120, 0], endNpc: [280, 330], endNeeds: [560, 330], endSay: [840, 330], endGives: [1120, 330] };
    function defaults(g) {
      const out = { ...ROW }, per = new Map();
      for (const n of g.nodes) {
        if (ROW[n.id]) continue;
        const a = find2(n.id), parent = a?.parent, i = per.get(parent) || 0;
        per.set(parent, i + 1);
        if (!parent) { out[n.id] = [0, 170 + i * 120]; continue; }
        const [px, py] = ROW[parent];
        out[n.id] = py === 0 ? [px, -150 - i * 120] : [px, py + 190 + i * 120];
      }
      return out;
    }
    return {
      types, build, defaults,
      addable: Object.entries(PIECE).map(([type, [label]]) => ({ type, label })),
      connect(from, to) {
        const a = find2(from[0]), l = loose.find((x) => x.id === from[0]), type = a ? a.type : l?.type, data = a ? a.data : l?.data;
        if (!data || !LISTS[type]) return false;
        if (a) detach(a); else loose.splice(loose.indexOf(l), 1);
        return attach(type, data, to[0]);
      },
      disconnect(w) { const a = find2(w.from[0]); if (!a) return false; detach(a); loose.push({ id: `loose:${Date.now().toString(36)}`, type: a.type, data: a.data }); return true; },
      remove(id) { const a = find2(id); if (a) detach(a); else { const i = loose.findIndex((x) => x.id === id); if (i >= 0) loose.splice(i, 1); } return true; },
      add(type) { const id = `loose:${Date.now().toString(36)}`; loose.push({ id, type, data: structuredClone(freshPiece[type]) }); return id; },
      inspect(id) {
        const lines = (say) => [numKeys(say).map((k) => h('label', { class: 'word' }, `Line ${Number(k) + 1}`, h('textarea', { rows: 3, value: typeof say[k] === 'string' ? say[k] : '', oninput: (e) => { say[k] = e.target.value; touch(); } }),
          h('button', { type: 'button', class: 'quiet danger', onclick: () => { delete say[k]; touch(); side(); } }, 'Take this line off'))),
        h('button', { type: 'button', onclick: () => { say[nextKey(say)] = ''; touch(); side(); } }, 'Add a line'),
        h('details', { class: 'group' }, h('summary', null, h('span', { class: 'group-name' }, 'The rest of it (yes, no, stop...)')), tree(say, 1, numKeys(say)))];
        const info = q.QuestInfo, text = (key, label) => h('label', { class: 'word' }, label, h('textarea', { rows: 3, value: typeof info[key] === 'string' ? info[key] : '', oninput: (e) => { info[key] = e.target.value; touch(); } }));
        switch (id) {
          case null: case undefined: case 'quest': return [h('h3', null, 'The quest'), h('label', { class: 'word' }, 'Name', h('input', { type: 'text', value: typeof info.name === 'string' ? info.name : '', oninput: (e) => { info.name = e.target.value; touch(); drawHead(); } })),
            text('0', 'In the quest window before it is started'), text('1', 'While it is under way'), text('2', 'Once it is done'),
            h('details', { class: 'group' }, h('summary', null, h('span', { class: 'group-name' }, 'Everything the game keeps about it (QuestInfo)')), tree(info, 1)),
            h('p', { class: 'muted' }, 'Add items to bring, monsters to hunt, quests needed and items given from Add, and wire each into the step it belongs to.')];
          case 'startNpc': return [h('h3', null, 'Given by'), pickRow('NPC', q.Check[0], 'npc', 'npc'), h('p', { class: 'muted' }, 'An NPC of your own works too. Anything more than its lines is a script on the game server (scripts/quest/<its number>.js).')];
          case 'endNpc': return [h('h3', null, 'Handed in to'), pickRow('NPC', q.Check[1], 'npc', 'npc')];
          case 'startNeeds': return [h('h3', null, 'To start it (Check 0)'), h('p', { class: 'muted' }, 'lvmin and lvmax for the level, job for the jobs; items and quests needed are wired in.'), tree(q.Check[0], 0, ['npc', 'item', 'quest'])];
          case 'endNeeds': return [h('h3', null, 'To finish it (Check 1)'), h('p', { class: 'muted' }, 'Items to bring and monsters to hunt are wired in.'), tree(q.Check[1], 0, ['npc', 'item', 'mob'])];
          case 'startSay': return [h('h3', null, 'What is said at the start (Say 0)'), ...lines(q.Say[0])];
          case 'endSay': return [h('h3', null, 'What is said at the end (Say 1)'), ...lines(q.Say[1])];
          case 'startGives': return [h('h3', null, 'What starting it gives (Act 0)'), tree(q.Act[0], 0, ['item'])];
          case 'endGives': return [h('h3', null, 'What finishing it gives (Act 1)'), h('p', { class: 'muted' }, 'exp, money, pop (fame), nextQuest; items are wired in (a count below zero takes the item away).'), tree(q.Act[1], 0, ['item'])];
          default: {
            const a = find2(id), l = loose.find((x) => x.id === id), d = a?.data || l?.data, type = a ? a.type : l?.type;
            if (!d || !PIECE[type]) return [];
            const [label, what] = PIECE[type];
            return [h('h3', null, label), pickRow(what === 'mob' ? 'Monster' : what === 'quest' ? 'Quest' : 'Item', d, 'id', what),
              type !== 'needQuest' ? h('label', { class: 'field' }, h('span', null, 'count'), h('input', { type: 'number', value: d.count ?? 1, onchange: (e) => { d.count = Number(e.target.value) || 0; touch(); } })) : null,
              type === 'needQuest' ? h('label', { class: 'field' }, h('span', null, 'it is'), h('select', { onchange: (e) => { d.state = Number(e.target.value); touch(); } }, [[0, 'not started'], [1, 'under way'], [2, 'done']].map(([v, t2]) => h('option', { value: v, selected: Number(d.state ?? 2) === v }, t2)))) : null,
              l ? h('p', { class: 'muted' }, 'Not wired in: it counts for nothing until it is wired into a step.') : h('p', { class: 'muted' }, 'Cut its wire to set it aside, or wire it into another step.')];
          }
        }
      },
    };
  }

  // ---------------------------------------------------------------- the board and the side, shown
  /** Where the current board's nodes sit, kept with the draft. */
  const kept = () => { const key = rec.kind === 'npc' ? view : 'nodes'; return (rec.layout[key] = isObj(rec.layout[key]) ? rec.layout[key] : {}); };
  function makeSpec() {
    if (rec.kind === 'quest') return questSpec();
    if (rec.kind === 'npc') return view === 'dialogue' ? dialogueSpec() : npcLookSpec();
    return thingSpec();
  }
  /** What the board shows now, laid out (from where nodes were put, or in columns). */
  function showBoard() {
    if (!board) return;
    spec = makeSpec();
    const g = spec.build();
    if (spec.kept) for (const n of g.nodes) { n.x = n.x ?? 0; n.y = n.y ?? 0; }
    else arrange(g, { ...(spec.defaults ? spec.defaults(g) : {}), ...kept() });
    board.show(g);
  }
  function side() { fill(inspect, spec ? spec.inspect(picked) : null); }
  const posePicked = () => (picked?.startsWith('pose:') ? picked.slice(5) : null);
  function newBoard() {
    spec = makeSpec();
    board = nodeBoard({
      types: spec.types, addable: spec.addable || [],
      onSelect: (id) => { picked = id; side(); if (preview && rec) preview.show(rec, posePicked()); },
      onMove: (id, x, y) => { if (spec.move) spec.move(id, x, y); else kept()[id] = [x, y]; touch(); },
      onConnect: (w) => { if (spec.connect(w.from, w.to)) { touch(); showBoard(); side(); } },
      onDisconnect: (w) => { if (spec.disconnect(w)) { touch(); showBoard(); side(); } },
      onDelete: (id) => { if (spec.remove(id)) { if (picked === id) picked = null; touch(); showBoard(); side(); } },
      onAdd: async (type, x, y) => {
        const id = await spec.add(type, x, y);
        if (!id) return;
        if (!spec.kept) kept()[id] = [x, y];
        picked = id; touch(); showBoard(); board.select(id, false); side();
      },
    });
  }

  function draw() {
    drawHead();
    if (!rec) { board = null; fill(editor, h('div', { class: 'thing-empty' }, h('h2', null, kinds.map((k) => k[1]).join(' and ')), h('p', null, blurb))); return; }
    if (!board) newBoard();
    fill(editor, h('div', { class: 'thing-board' }, board.el), inspect);
    showBoard();
    side();
    if (preview) preview.show(rec, posePicked());
  }

  fill(host, h('div', { class: 'things' },
    h('aside', { class: 'thing-side' }, pickKind, find, h('div', { class: 'side-buttons' }, h('button', { type: 'button', onclick: newOne }, 'New...'), h('button', { type: 'button', onclick: importZip, title: 'Open one someone exported, as your draft' }, 'Import zip...')), list),
    h('div', { class: 'thing-main' }, head, editor)));
  draw();
  return { unsaved: () => changed, show() { lookup(find.value); } };
}
