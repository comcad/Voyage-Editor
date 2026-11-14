/**
 * A map as a zip, to keep or to pass on, with what of yours it needs:
 *
 *   map.json                       the map, its names, which picture each background of yours is, and the NPCs and
 *                                  monsters of yours on it
 *   pictures/<name>.png            the pictures of yours it uses (objects and backgrounds of the set "custom")
 *   music/<name>.mp3               its music, when it plays a track of yours
 *   npc-pictures/<name>.png        the pictures of the NPCs of yours on it
 *   customs/Mob/<id>.img.json ...  the monsters on it made as files of the customs folder: each one's file and pictures
 *
 * An NPC of yours is one the editor has (your draft or published one), or one made by hand in the customs folder: that
 * one goes as one of yours, its pictures among your NPC pictures. Importing saves the map, and the NPCs, as your drafts;
 * pictures, music and monsters are brought in. One with the number or name of a different one here comes in under the
 * next free number or as <name>_2, and the map is made to use that; one that is the same is used as it is.
 */
import { api, sendPicture, sendFile } from './api.js';
import { pictureUrl, download } from './ui.js';
import { musicUrl, musicList, importTrack } from './music.js';
import { makeZip, readZip } from './zip.js';

const FORMAT = 'voyage-map', VERSION = 2, OWN_MUSIC = 'BgmCustom/';
const LAYERS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const NAME = '[A-Za-z0-9][A-Za-z0-9_-]{0,39}';
const NPC_PIC = new RegExp(`^_custom/npcs/(${NAME})\\.png$`);
const MOB_FILE = /^Mob\/(\d{7})\.img(?:\.json|(?:\/[A-Za-z0-9_-]+)+\.png)$/;
const pad7 = (n) => String(n).padStart(7, '0');
/** The objects made of your pictures (the set "custom"), and the backgrounds. */
const customObjs = (tree) => LAYERS.flatMap((l) => Object.values(tree[l]?.obj || {})).filter((o) => o?.oS === 'custom' && o.l0 === 'pictures' && o.l1 !== undefined);
const customBacks = (tree) => Object.values(tree.back || {}).filter((b) => b?.bS === 'custom');
/** The numbers of the NPCs ("n") or monsters ("m") standing on a map. */
const lifeIds = (tree, type) => [...new Set(Object.values(tree.life || {}).filter((l) => l?.type === type && /^\d{1,7}$/.test(String(l.id ?? ''))).map((l) => Number(l.id)))];
/** Every picture in a tree. */
const canvases = (node, out = []) => {
  if (node && typeof node === 'object') {
    if (typeof node._canvas === 'string') out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') canvases(v, out);
  }
  return out;
};
const bytesOf = async (url) => { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
const fileWord = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const text = (bytes) => new TextDecoder().decode(bytes);
/** A life id written the way the map had it (a string padded as it was, or a number). */
const sameForm = (was, id) => (typeof was === 'string' ? String(id).padStart(was.length, '0') : id);
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

  // NPCs of yours: the editor's own, or ones made by hand in the customs folder (their pictures become NPC pictures)
  const npcs = [], npcPictures = new Map();
  for (const id of lifeIds(tree, 'n')) {
    let rec = null;
    try { rec = await api(`/c/npc/${id}`); } catch { /* not one the game or the editor has */ }
    if (rec && rec.from !== 'assets') {
      npcs.push({ id, words: rec.words, tree: rec.tree });
      for (const c of canvases(rec.tree)) {
        const m = NPC_PIC.exec(c._canvas);
        if (!m || npcPictures.has(m[1])) continue;
        const bytes = await bytesOf(pictureUrl('npc', m[1]));
        if (bytes) npcPictures.set(m[1], bytes); else missing.push(`NPC ${id}'s picture ${m[1]}`);
      }
      continue;
    }
    const life = await api(`/life/npc/${id}`);
    if (!life.files.length) continue;   // the game's own
    const own = await bytesOf(`/assets/${life.files[0]}`);
    let t = null;
    try { t = JSON.parse(text(own)); } catch { missing.push(`NPC ${id} (its file can't be read)`); continue; }
    const inCustoms = new Set(life.files);
    for (const c of canvases(t)) {
      if (!inCustoms.has(`Npc/${c._canvas}`)) continue;   // (a picture the assets have: it stays as it is)
      const name = fileWord(`npc${id}_${c._canvas.slice(`${pad7(id)}.img/`.length).replace(/\.png$/, '')}`) || `npc${id}`;
      if (!npcPictures.has(name)) { const bytes = await bytesOf(`/assets/Npc/${c._canvas}`); if (bytes) npcPictures.set(name, bytes); else { missing.push(`NPC ${id}'s picture ${c._canvas}`); continue; } }
      c._canvas = `_custom/npcs/${name}.png`;
    }
    npcs.push({ id, words: { name: life.name?.name ?? '', func: life.name?.func ?? '' }, tree: t });
  }
  for (const [name, bytes] of npcPictures) files.push([`npc-pictures/${name}.png`, bytes]);

  // monsters made as files of the customs folder (and any of yours they take their pictures from, info/link)
  const mobs = [], seen = new Set();
  const addMob = async (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const life = await api(`/life/mob/${id}`);
    if (!life.files.length) return;   // the game's own
    mobs.push({ id, name: life.name?.name ?? '', files: life.files });
    let link = null;
    for (const f of life.files) {
      const bytes = await bytesOf(`/assets/${f}`);
      if (!bytes) { missing.push(`monster ${id}'s file ${f}`); continue; }
      files.push([`customs/${f}`, bytes]);
      if (f.endsWith('.json')) { try { link = Number(JSON.parse(text(bytes))?.info?.link); } catch { /* left as it is */ } }
    }
    if (Number.isInteger(link) && link > 0) await addMob(link);
  };
  for (const id of lifeIds(tree, 'm')) await addMob(id);

  const map = { format: FORMAT, version: VERSION, id: doc.id, words: doc.name, backPictures, npcs, mobs, tree };
  files.unshift(['map.json', new TextEncoder().encode(JSON.stringify(map, null, 1))]);
  const label = fileWord(doc.name?.mapName || '');
  download(await makeZip(files), `map-${doc.id}${label ? `-${label}` : ''}.zip`);
  return missing;
}

/**
 * A map's zip, read: { id, words, tree, backPictures, pictures (name -> bytes), music ({ name, bytes } or null),
 * npcs ([{ id, words, tree }]), npcPictures (name -> bytes), mobs ([{ id, name, files: [[path, bytes]] }]) }.
 * Throws saying why it can't be.
 */
export async function readMapZip(file) {
  if (file.size > 300 * 1024 * 1024) throw new Error('it is larger than 300 MB');
  const files = await readZip(file);
  // (zipped again as a folder, map.json is a folder down: everything is read from there)
  const at = [...files.keys()].filter((n) => n === 'map.json' || n.endsWith('/map.json')).sort((a, b) => a.length - b.length)[0];
  if (!at) throw new Error('it has no map.json, so it isn’t a map’s zip');
  const base = at.slice(0, -'map.json'.length), get = (rel) => files.get(base + rel);
  let map;
  try { map = JSON.parse(text(files.get(at))); } catch { throw new Error('its map.json can’t be read'); }
  if (map?.format !== FORMAT || !map.tree || typeof map.tree !== 'object' || Array.isArray(map.tree)) throw new Error('its map.json isn’t a map exported by the editor');
  if (map.version > VERSION) throw new Error('it was exported by a newer editor');
  const pictures = new Map(), npcPictures = new Map();
  const pic = new RegExp(`^pictures/(${NAME})\\.png$`), tune = new RegExp(`^music/(${NAME})\\.mp3$`), npcPic = new RegExp(`^npc-pictures/(${NAME})\\.png$`);
  let music = null;
  for (const [n, bytes] of files) {
    if (!n.startsWith(base)) continue;
    const rel = n.slice(base.length), p = pic.exec(rel), t = tune.exec(rel), q = npcPic.exec(rel);
    if (p) pictures.set(p[1], bytes); else if (t) music = { name: t[1], bytes }; else if (q) npcPictures.set(q[1], bytes);
  }
  const npcs = (Array.isArray(map.npcs) ? map.npcs : []).filter((n) => Number.isInteger(n?.id) && n.id > 0 && n.id <= 9999999 && n.tree && typeof n.tree === 'object' && !Array.isArray(n.tree))
    .map((n) => ({ id: n.id, tree: n.tree, words: { name: String(n.words?.name ?? '').slice(0, 100), func: String(n.words?.func ?? '').slice(0, 100) } }));
  const mobs = [];
  for (const m of Array.isArray(map.mobs) ? map.mobs : []) {
    if (!Number.isInteger(m?.id) || m.id < 0 || m.id > 9999999 || !Array.isArray(m.files)) continue;
    const list = m.files.filter((f) => typeof f === 'string' && MOB_FILE.exec(f)?.[1] === pad7(m.id)).map((f) => [f, get(`customs/${f}`)]);
    if (list.some(([, b]) => !b)) throw new Error(`monster ${m.id}'s files aren’t all in it`);
    if (list.some(([f]) => f.endsWith('.json'))) mobs.push({ id: m.id, name: String(m.name ?? '').slice(0, 100), files: list });
  }
  return {
    id: Number.isInteger(map.id) ? map.id : null, tree: map.tree, backPictures: map.backPictures && typeof map.backPictures === 'object' ? map.backPictures : {},
    words: { streetName: String(map.words?.streetName ?? '').slice(0, 100), mapName: String(map.words?.mapName ?? '').slice(0, 100) }, pictures, music, npcs, npcPictures, mobs,
  };
}

/** The number an NPC of the zip gets here: its own, or the next free one; one of yours that is the same is used as it is. */
async function npcPlace(id, want) {
  for (let n = id, tries = 0; tries < 2000 && n <= 9999999; n++, tries++) {
    const s = await api(`/c/npc/${n}/state`);
    if (!s.assets && !s.draft && !s.live) return { id: n, fresh: true };
    if (s.draft || s.live) { const r = await api(`/c/npc/${n}`); if (JSON.stringify({ tree: r.tree, words: r.words }) === want(n)) return { id: n, fresh: false }; }
  }
  throw new Error(`there is no free NPC number near ${id}`);
}
/** The same for a monster: its own number, or the next one neither the assets nor the customs folder has. */
async function mobPlace(id, want) {
  for (let n = id, tries = 0; tries < 2000 && n <= 9999999; n++, tries++) {
    const life = await api(`/life/mob/${n}`);
    if (!life.assets && !life.files.length) return { id: n, fresh: true };
    const json = life.files.find((f) => f.endsWith('.json'));
    if (json) { const here = await bytesOf(`/assets/${json}`); try { if (here && JSON.stringify(JSON.parse(text(here))) === want(n)) return { id: n, fresh: false }; } catch { /* not the same */ } }
  }
  throw new Error(`there is no free monster number near ${id}`);
}
/** A monster's file moved to another number: its pictures' paths say so. */
function moveMob(tree, from, to) {
  const t = structuredClone(tree), was = `${pad7(from)}.img/`;
  if (from !== to) for (const c of canvases(t)) if (c._canvas.startsWith(was)) c._canvas = `${pad7(to)}.img/${c._canvas.slice(was.length)}`;
  return t;
}

/**
 * Saves a read zip as your draft of map `id`, after bringing in what it needs and making the map use what it is
 * called here. Resolves notes worth telling (what came in under another number or name, what to publish too).
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

  // NPCs of yours: their pictures first, then each one as your draft (under the next free number when a different NPC has its own)
  const movedNpc = new Map();
  if (z.npcs.length) {
    const takenNpc = new Set((await api('/pictures/npc')).map((p) => p.name)), npcRenamed = new Map();
    for (const [name, bytes] of z.npcPictures) {
      const { as, fresh } = await placeFor(name, bytes, takenNpc, (n) => pictureUrl('npc', n));
      if (fresh) { await sendPicture(`/pictures/npc/${as}`, new Blob([bytes], { type: 'image/png' })); takenNpc.add(as); }
      if (as !== name) npcRenamed.set(name, as);
    }
    const drafts = [];
    for (const n of z.npcs) {
      const t = structuredClone(n.tree);
      for (const c of canvases(t)) { const m = NPC_PIC.exec(c._canvas); if (m && npcRenamed.has(m[1])) c._canvas = `_custom/npcs/${npcRenamed.get(m[1])}.png`; }
      const want = JSON.stringify({ tree: t, words: n.words });
      const place = await npcPlace(n.id, () => want);
      if (place.fresh) { await api(`/c/npc/${place.id}`, { method: 'PUT', body: { tree: t, words: n.words } }); drafts.push(place.id); }
      if (place.id !== n.id) { movedNpc.set(n.id, place.id); notes.push(`NPC ${n.id} is NPC ${place.id} here, as a different NPC has ${n.id}`); }
    }
    if (drafts.length) notes.push(`NPC${drafts.length === 1 ? '' : 's'} ${drafts.join(', ')} ${drafts.length === 1 ? 'is a draft' : 'are drafts'}: publish ${drafts.length === 1 ? 'it' : 'them'} on the NPCs tab too`);
  }

  // monsters: their files go in the customs folder as files of yours (under the next free number when one has theirs).
  // One another takes its pictures from (info/link) comes first, so the one after points at where it is here.
  const movedMob = new Map(), wrote = [];
  for (const m of [...z.mobs].reverse()) {
    const json = JSON.parse(text(m.files.find(([f]) => f.endsWith('.json'))[1])), link = Number(json?.info?.link);
    const shaped = (n) => { const t = moveMob(json, m.id, n); if (movedMob.has(link)) t.info.link = sameForm(json.info.link, movedMob.get(link)); return t; };
    const place = await mobPlace(m.id, (n) => JSON.stringify(shaped(n)));
    if (place.id !== m.id) movedMob.set(m.id, place.id);
    if (!place.fresh) continue;
    for (const [f, bytes] of m.files) {
      const to = f.replace(`Mob/${pad7(m.id)}.img`, `Mob/${pad7(place.id)}.img`);
      const body = f.endsWith('.json') ? new TextEncoder().encode(JSON.stringify(shaped(place.id))) : bytes;
      await sendFile(`/customs/${to}`, new Blob([body]), 'application/octet-stream');
    }
    wrote.push({ id: place.id, name: m.name });
  }
  if (wrote.length) {
    await api('/strings/mob', { method: 'POST', body: Object.fromEntries(wrote.map((w) => [String(w.id), { name: w.name }])) });
    notes.push(`monster${wrote.length === 1 ? '' : 's'} ${wrote.map((w) => w.id).join(', ')} ${wrote.length === 1 ? 'was' : 'were'} put in the customs folder`);
  }
  for (const [from, to] of movedMob) notes.push(`monster ${from} is monster ${to} here, as a different monster has ${from}`);

  // the map's NPCs and monsters where they are now
  for (const l of Object.values(tree.life || {})) {
    const moved = l?.type === 'n' ? movedNpc : l?.type === 'm' ? movedMob : null, was = Number(l?.id);
    if (moved?.has(was)) l.id = sameForm(l.id, moved.get(was));
  }
  await api(`/c/map/${id}`, { method: 'PUT', body: { tree, words: z.words } });
  return notes;
}

/** (also used for the zips of items, NPCs and quests) */
export { placeFor, bytesOf };
