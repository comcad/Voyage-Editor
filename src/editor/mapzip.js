/**
 * A map as a zip, to keep or to pass on: map.json (the map, its names, and which of your pictures its backgrounds
 * use), the pictures of yours it uses (pictures/<name>.png) and the music of yours it plays (music/<name>.mp3).
 * Importing one saves it as your draft of a map number you pick and brings its pictures and music in: one with the
 * name of a different one here comes in under a new name, and the map is made to use that.
 */
import { api, sendPicture } from './api.js';
import { pictureUrl, download } from './ui.js';
import { musicUrl, musicList, importTrack } from './music.js';
import { makeZip, readZip } from './zip.js';

const FORMAT = 'voyage-map', VERSION = 1, OWN_MUSIC = 'BgmCustom/';
const LAYERS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const NAME = '[A-Za-z0-9][A-Za-z0-9_-]{0,39}';
/** The objects made of your pictures (the set "custom"), and the backgrounds. */
const customObjs = (tree) => LAYERS.flatMap((l) => Object.values(tree[l]?.obj || {})).filter((o) => o?.oS === 'custom' && o.l0 === 'pictures' && o.l1 !== undefined);
const customBacks = (tree) => Object.values(tree.back || {}).filter((b) => b?.bS === 'custom');
const bytesOf = async (url) => { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
const fileWord = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
/** name, then name_2, name_3 ... (40 characters at most). */
const nameNo = (name, i) => (i < 2 ? name : `${name.slice(0, 39 - String(i).length)}_${i}`);
/**
 * What a file of the zip is called here: its own name, or name_2, name_3 ... when a different one has it; one of
 * those that is the same file already is used as it is (a zip imported again brings nothing in twice). Resolves
 * { as, fresh } (fresh: it isn't here yet).
 */
async function placeFor(name, bytes, taken, urlOf) {
  for (let i = 1; ; i++) {
    const as = nameNo(name, i);
    if (!taken.has(as)) return { as, fresh: true };
    if (same(await bytesOf(urlOf(as)), bytes)) return { as, fresh: false };
  }
}

/** The map as it is in the editor (changes not saved included) as a zip, given to the browser to save. Resolves what was left out. */
export async function exportMap(doc) {
  const tree = structuredClone(doc.tree), missing = [], files = [];
  const pics = await api('/pictures/map'), byNo = new Map(pics.map((p) => [p.no, p.name])), have = new Set(pics.map((p) => p.name));
  const backPictures = {};
  for (const b of customBacks(tree)) { const name = byNo.get(Number(b.no)); if (name) backPictures[b.no] = name; else missing.push(`background ${b.no}`); }
  for (const name of new Set([...customObjs(tree).map((o) => String(o.l1)), ...Object.values(backPictures)])) {
    const bytes = have.has(name) ? await bytesOf(pictureUrl('map', name)) : null;
    if (bytes) files.push([`pictures/${name}.png`, bytes]); else missing.push(`the picture ${name}`);
  }
  const bgm = tree.info?.bgm;
  if (typeof bgm === 'string' && bgm.startsWith(OWN_MUSIC)) {
    const bytes = await bytesOf(musicUrl(bgm));
    if (bytes) files.push([`music/${bgm.slice(OWN_MUSIC.length)}.mp3`, bytes]); else missing.push(`the music ${bgm}`);
  }
  const map = { format: FORMAT, version: VERSION, id: doc.id, words: doc.name, backPictures, tree };
  files.unshift(['map.json', new TextEncoder().encode(JSON.stringify(map, null, 1))]);
  const label = fileWord(doc.name?.mapName || '');
  download(await makeZip(files), `map-${doc.id}${label ? `-${label}` : ''}.zip`);
  return missing;
}

/** A map's zip, read: { id, words, tree, backPictures, pictures (name -> bytes), music ({ name, bytes } or null) }. Throws saying why it can't be. */
export async function readMapZip(file) {
  if (file.size > 300 * 1024 * 1024) throw new Error('it is larger than 300 MB');
  const files = await readZip(file);
  // (zipped again as a folder, map.json is a folder down: everything is read from there)
  const at = [...files.keys()].filter((n) => n === 'map.json' || n.endsWith('/map.json')).sort((a, b) => a.length - b.length)[0];
  if (!at) throw new Error('it has no map.json, so it isn’t a map’s zip');
  const base = at.slice(0, -'map.json'.length);
  let map;
  try { map = JSON.parse(new TextDecoder().decode(files.get(at))); } catch { throw new Error('its map.json can’t be read'); }
  if (map?.format !== FORMAT || !map.tree || typeof map.tree !== 'object' || Array.isArray(map.tree)) throw new Error('its map.json isn’t a map exported by the editor');
  if (map.version > VERSION) throw new Error('it was exported by a newer editor');
  const pictures = new Map(), pic = new RegExp(`^pictures/(${NAME})\\.png$`), tune = new RegExp(`^music/(${NAME})\\.mp3$`);
  let music = null;
  for (const [n, bytes] of files) {
    if (!n.startsWith(base)) continue;
    const rel = n.slice(base.length), p = pic.exec(rel), t = tune.exec(rel);
    if (p) pictures.set(p[1], bytes); else if (t) music = { name: t[1], bytes };
  }
  return {
    id: Number.isInteger(map.id) ? map.id : null, tree: map.tree, backPictures: map.backPictures && typeof map.backPictures === 'object' ? map.backPictures : {},
    words: { streetName: String(map.words?.streetName ?? '').slice(0, 100), mapName: String(map.words?.mapName ?? '').slice(0, 100) }, pictures, music,
  };
}

/**
 * Saves a read zip as your draft of map `id`, after bringing in its pictures and music and making the map use what
 * they are called here. Resolves notes worth telling (what was brought in under another name, what is missing).
 */
export async function importMap(z, id) {
  const tree = structuredClone(z.tree), notes = [];
  // a map that led to its own number leads to its new one
  if (z.id !== null && z.id !== id) {
    for (const k of ['returnMap', 'forcedReturn']) if (tree.info?.[k] === z.id) tree.info[k] = id;
    for (const p of Object.values(tree.portal || {})) if (p?.tm === z.id) p.tm = id;
  }
  // pictures: one here already that is the same is used as it is; one that differs comes in under a new name
  const taken = new Set((await api('/pictures/map')).map((p) => p.name)), renamed = new Map();
  for (const [name, bytes] of z.pictures) {
    const { as, fresh } = await placeFor(name, bytes, taken, (n) => pictureUrl('map', n));
    if (fresh) { await sendPicture(`/pictures/map/${as}`, new Blob([bytes], { type: 'image/png' })); taken.add(as); }
    if (as !== name) { renamed.set(name, as); notes.push(`the picture ${name} is called ${as} here, as a different ${name} was here already`); }
  }
  for (const o of customObjs(tree)) if (renamed.has(String(o.l1))) o.l1 = renamed.get(String(o.l1));
  // a background names its picture by a number this editor gives it: the zip says which picture each one is
  if (customBacks(tree).length) {
    const numbers = new Map((await api('/pictures/map')).map((p) => [p.name, p.no]));
    for (const b of customBacks(tree)) {
      const name = z.backPictures[b.no], as = renamed.get(name) || name;
      if (as && numbers.has(as)) b.no = numbers.get(as); else notes.push(`background ${b.no} has no picture in the zip`);
    }
  }
  // the music the same way
  if (z.music && tree.info?.bgm === `${OWN_MUSIC}${z.music.name}`) {
    const names = new Set((await musicList(true)).tracks.map((t) => t.name));
    const { as, fresh } = await placeFor(z.music.name, z.music.bytes, names, (n) => musicUrl(`${OWN_MUSIC}${n}`));
    if (fresh) await importTrack(new File([z.music.bytes], `${as}.mp3`, { type: 'audio/mpeg' }));
    if (as !== z.music.name) notes.push(`the music ${z.music.name} is called ${as} here, as a different track of that name was here already`);
    tree.info.bgm = `${OWN_MUSIC}${as}`;
  }
  await api(`/c/map/${id}`, { method: 'PUT', body: { tree, words: z.words } });
  return notes;
}
