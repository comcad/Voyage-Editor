/**
 * An item, equip, NPC or quest as a zip, to keep or to pass on:
 *
 *   thing.json                  what it is (its kind and number), its words, its tree, where its nodes sit, and an
 *                               NPC's dialogue
 *   pictures/<folder>/<name>.png the pictures of yours it uses (from the Import tab: equips, items, npcs or maps)
 *
 * Importing one saves it as your draft of a number you pick and brings its pictures in: one with the name of a
 * different one here comes in as <name>_2 and it is made to use that; one that is the same is used as it is.
 */
import { api, sendPicture } from './api.js';
import { pictureUrl, download } from './ui.js';
import { makeZip, readZip } from './zip.js';
import { placeFor, bytesOf } from './mapzip.js';

const FORMAT = 'voyage-thing', VERSION = 1;
const KINDS = ['item', 'equip', 'npc', 'quest'];
const DIR_KIND = { maps: 'map', npcs: 'npc', equips: 'equip', items: 'item' };
const PIC = /^_custom\/(maps|npcs|equips|items)\/([A-Za-z0-9][A-Za-z0-9_-]{0,39})\.png$/;
const fileWord = (s) => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
/** Every picture in a tree. */
const canvases = (node, out = []) => {
  if (node && typeof node === 'object') {
    if (typeof node._canvas === 'string') out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') canvases(v, out);
  }
  return out;
};

/** The thing open in the editor (changes not saved included) as a zip, given to the browser to save. Resolves what was left out. */
export async function exportThing(rec) {
  const files = [], missing = [], seen = new Set();
  for (const c of canvases(rec.tree)) {
    const m = PIC.exec(c._canvas);
    if (!m || seen.has(`${m[1]}/${m[2]}`)) continue;
    seen.add(`${m[1]}/${m[2]}`);
    const bytes = await bytesOf(pictureUrl(DIR_KIND[m[1]], m[2]));
    if (bytes) files.push([`pictures/${m[1]}/${m[2]}.png`, bytes]); else missing.push(`the picture ${m[2]}`);
  }
  const thing = { format: FORMAT, version: VERSION, kind: rec.kind, id: rec.id, words: rec.words, folder: rec.folder, tree: rec.tree, layout: rec.layout || null, dialogue: rec.dialogue || null };
  files.unshift(['thing.json', new TextEncoder().encode(JSON.stringify(thing, null, 1))]);
  const label = fileWord(rec.words?.name || rec.tree?.QuestInfo?.name);
  download(await makeZip(files), `${rec.kind}-${rec.id}${label ? `-${label}` : ''}.zip`);
  return missing;
}

/** A thing's zip, read: { kind, id, words, folder, tree, layout, dialogue, pictures (folder/name -> bytes) }. Throws saying why it can't be. */
export async function readThingZip(file) {
  if (file.size > 300 * 1024 * 1024) throw new Error('it is larger than 300 MB');
  const files = await readZip(file);
  const at = [...files.keys()].filter((n) => n === 'thing.json' || n.endsWith('/thing.json')).sort((a, b) => a.length - b.length)[0];
  if (!at) throw new Error(files.has('map.json') || [...files.keys()].some((n) => n.endsWith('/map.json')) ? 'it is a map’s zip: import it on the Maps tab' : 'it has no thing.json, so it isn’t an exported item, NPC or quest');
  const base = at.slice(0, -'thing.json'.length);
  let t;
  try { t = JSON.parse(new TextDecoder().decode(files.get(at))); } catch { throw new Error('its thing.json can’t be read'); }
  if (t?.format !== FORMAT || !KINDS.includes(t.kind) || !t.tree || typeof t.tree !== 'object' || Array.isArray(t.tree)) throw new Error('its thing.json isn’t one exported by the editor');
  if (t.version > VERSION) throw new Error('it was exported by a newer editor');
  const pictures = new Map(), pic = /^pictures\/(maps|npcs|equips|items)\/([A-Za-z0-9][A-Za-z0-9_-]{0,39})\.png$/;
  for (const [n, bytes] of files) { if (!n.startsWith(base)) continue; const m = pic.exec(n.slice(base.length)); if (m) pictures.set(`${m[1]}/${m[2]}`, bytes); }
  const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  return { kind: t.kind, id: Number.isInteger(t.id) ? t.id : null, words: plain(t.words) || {}, folder: typeof t.folder === 'string' ? t.folder : undefined, tree: t.tree, layout: plain(t.layout), dialogue: plain(t.dialogue), pictures };
}

/** Saves a read zip as your draft of number `id`, its pictures brought in first. Resolves notes worth telling. */
export async function importThing(z, id) {
  const tree = structuredClone(z.tree), notes = [], taken = new Map(), renamed = new Map();
  for (const [key, bytes] of z.pictures) {
    const [dir, name] = key.split('/'), kind = DIR_KIND[dir];
    if (!taken.has(dir)) taken.set(dir, new Set((await api(`/pictures/${kind}`)).map((p) => p.name)));
    const { as, fresh } = await placeFor(name, bytes, taken.get(dir), (n) => pictureUrl(kind, n));
    if (fresh) { await sendPicture(`/pictures/${kind}/${as}`, new Blob([bytes], { type: 'image/png' })); taken.get(dir).add(as); }
    if (as !== name) { renamed.set(key, as); notes.push(`the picture ${name} is called ${as} here, as a different ${name} was here already`); }
  }
  for (const c of canvases(tree)) { const m = PIC.exec(c._canvas); if (m && renamed.has(`${m[1]}/${m[2]}`)) c._canvas = `_custom/${m[1]}/${renamed.get(`${m[1]}/${m[2]}`)}.png`; }
  await api(`/c/${z.kind}/${id}`, { method: 'PUT', body: { tree, words: z.words, folder: z.folder, layout: z.layout, dialogue: z.dialogue } });
  if (z.kind === 'quest') notes.push('the NPCs, items and monsters it names are the ones with those numbers here');
  return notes;
}
