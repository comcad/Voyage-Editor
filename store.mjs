/**
 * What you make with the editor: maps, NPCs, equips, items and quests of your own (or the game's, changed), and the
 * pictures you bring in for them. Your work is kept under Editor.DataDir; the assets folder is only ever read.
 *
 *   data/
 *     maps/     100000100.json     a map as you are working on it (only the editor sees it)
 *               published/         the maps you published
 *               pictures/          pictures brought in for maps: they are the "custom" object set and background set
 *     npcs/     9901000.json ...   published/   pictures/
 *     equips/   01302999.json ...  published/   pictures/
 *     items/    02000999.json ...  published/   pictures/
 *     quests/   29950.json ...     published/
 *     music/    Theme.mp3 ...      music brought in for maps (lengths.json: each one's length): the music set
 *                                  BgmCustom, which a map plays as BgmCustom/<name>
 *     customs-written.json         the files of the customs folder the editor wrote
 *
 * A file here is { id, kind, words (its name and the like), tree (the same tree the assets keep for one), folder, layout
 * (where its nodes sit in the node editor), dialogue (an NPC's: the graph its script is made from) }.
 * A quest's tree has four parts, one for each of the game's files a quest is spread over: QuestInfo (its name and
 * what the quest window says), Check (what starting and finishing it take, and the NPC for each), Act (what it gives
 * and takes), Say (what the NPC says).
 *
 * Publishing writes the assets' customs folder (assets/customs, laid out like the assets), which Voyage-Client and
 * Voyage-Server read in place of the assets' own files: a published map, NPC or equip as its whole file; a published
 * item or quest put into the file the assets keep it in with its neighbours; the names put into the String file they
 * belong to; the pictures where the trees that use them say they are; the music as Sound/BgmCustom.img; a published
 * NPC's dialogue as its script, scripts/npc/<number>.js (Voyage-Server reads it in place of its own). Every such file is written whole, with
 * everything published in it, and one nothing published accounts for any more is taken out again. The editor only
 * ever takes out files it wrote (customs-written.json lists them): a file you put in the customs folder yourself
 * stays, and the editor builds on it (a String file of yours gets the names put into it).
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import { compileDialogue } from './src/editor/dialogue-script.js';

const pad = (id, n) => String(id).padStart(n, '0');
export const KINDS = {
  map: { dir: 'maps', digits: 9, family: 'Map', words: ['streetName', 'mapName'], min: 0, max: 999999999 },
  npc: { dir: 'npcs', digits: 7, family: 'Npc', words: ['name', 'func'], min: 1, max: 9999999 },
  equip: { dir: 'equips', digits: 8, family: 'Character', words: ['name', 'desc'], min: 1000000, max: 1999999 },
  item: { dir: 'items', digits: 8, family: 'Item', words: ['name', 'desc'], min: 2000000, max: 5999999 },
  quest: { dir: 'quests', digits: 5, family: 'Quest', words: [], min: 1, max: 99999 },
};
/** The files of Quest a quest is spread over; a quest's tree has a part of each name. */
const QUEST_PARTS = ['QuestInfo', 'Check', 'Act', 'Say'];
const LABEL = { map: 'A map', npc: 'An NPC', equip: 'An equip', item: 'An item', quest: 'A quest' };
/** An item's first digit: the folder of Item its file is in, and the String file its name is in. */
const ITEM_CATS = { 2: ['Consume', 'Consume'], 3: ['Install', 'Ins'], 4: ['Etc', 'Etc'], 5: ['Cash', 'Cash'] };
const PIC_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const PIC_URL = /^\/[A-Za-z]+\/_custom\/(maps|npcs|equips|items)\/([A-Za-z0-9][A-Za-z0-9_-]{0,39})\.png$/;
const SET = 'custom';   // the object set and the background set made of the pictures brought in for maps
const MUSIC = 'BgmCustom';   // the music set made of the tracks brought in: Sound/BgmCustom.img
const MOST_MUSIC_MS = 3 * 3600 * 1000;
/** Whether a file starts as an MP3 does: an ID3 tag, or an MPEG audio frame. */
const isMp3 = (buf) => Buffer.isBuffer(buf) && buf.length > 4 && (buf.toString('latin1', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));

/** The part of String/Map.img the game server looks under for a map's name, by its id. */
export function regionOf(id) {
  if (id < 100000000) return 'maple';
  if (id < 200000000) return 'victoria';
  if (id < 300000000) return 'ossyria';
  if (id < 400000000) return 'elin';
  if (id >= 540000000 && id < 560000000) return 'singapore';
  if (id >= 600000000 && id < 620000000) return 'MasteriaGL';
  if (id >= 677000000 && id < 677100000) return 'Episode1GL';
  if (id >= 670000000 && id < 682000000) return (id >= 674030000 && id < 674040000) || (id >= 680100000 && id < 680200000) ? 'etc' : 'weddingGL';
  if (id >= 682000000 && id < 683000000) return 'HalloweenGL';
  if (id >= 683000000 && id < 684000000) return 'event';
  if (id >= 800000000 && id < 900000000) return id >= 889100000 && id < 889200000 ? 'etc' : 'jp';
  return 'etc';
}
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);   // (whole or not at all: a player never gets half a file)
}
const stamp = (file) => { try { return Math.round(fs.statSync(file).mtimeMs).toString(36); } catch { return '0'; } };
/** A PNG's width and height, from its header; null when it isn't one. */
function pngSize(buf) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w > 0 && h > 0 && w <= 8192 && h <= 8192 ? { w, h } : null;
}

export class CustomStore {
  constructor(assetsDir, dataDir) {
    this.assets = assetsDir; this.dir = dataDir;
    this.customs = path.join(assetsDir, 'customs');   // where publishing writes
    this.writtenFile = path.join(dataDir, 'customs-written.json');
    this.strings = {};       // String/<file>.img from the assets, read once each
    this.folders = null;     // an equip's folder of Character, by id
    this.index = null;       // what is published (see published())
    this.texts = new Map();  // a served file's text, made once per change
    this.pics = new Map();   // a pictures folder's listing
    this.trackList = null;   // the music folder's listing
    this.gameMusic = null;   // the assets' music sets, read once
  }
  kind(k) { const kind = KINDS[k]; if (!kind) throw bad('No such kind of thing.', 404); return kind; }
  draftFile(k, id) { return path.join(this.dir, KINDS[k].dir, `${pad(id, KINDS[k].digits)}.json`); }
  liveFile(k, id) { return path.join(this.dir, KINDS[k].dir, 'published', `${pad(id, KINDS[k].digits)}.json`); }
  /** The files of the customs folder the editor wrote (and may take out again). */
  written() { return (this.wrote ??= new Set(readJson(this.writtenFile) || [])); }
  /** The file (no .json) the editor builds on: one put in the customs folder by anyone but the editor, else the assets' own. */
  baseFile(rel) {
    const own = path.join(this.customs, `${rel}.json`);
    return !this.written().has(`${rel}.json`) && fs.existsSync(own) ? own : path.join(this.assets, `${rel}.json`);
  }
  baseJson(rel) { return readJson(this.baseFile(rel)); }
  string(file) { return (this.strings[file] ??= this.baseJson(`String/${file}.img`) || {}); }
  checkId(k, id) {
    const kind = this.kind(k);
    if (!Number.isInteger(id) || id < kind.min || id > kind.max) throw bad(`${LABEL[k]}'s number is between ${kind.min} and ${kind.max}.`);
    if (k === 'item' && !ITEM_CATS[Math.floor(id / 1000000)]) throw bad('An item’s number starts with 2 (use), 3 (set-up), 4 (etc) or 5 (cash).');
    return id;
  }

  // ---------------------------------------------------------------- where a thing is kept in the assets
  /** An equip's folder of Character (Weapon, Cap...), from where its file is; null for one the assets don't have. */
  folderOf(id) {
    if (!this.folders) {
      this.folders = new Map();
      for (const e of fs.readdirSync(path.join(this.assets, 'Character'), { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.endsWith('.img')) continue;
        for (const f of fs.readdirSync(path.join(this.assets, 'Character', e.name))) { const m = /^(\d{8})\.img\.json$/.exec(f); if (m) this.folders.set(Number(m[1]), e.name); }
      }
    }
    return this.folders.get(id) || null;
  }
  /**
   * Where a thing lives: `rel` the asset file that holds it (no .json), `node` its key in that file (an item, which
   * shares a file with its neighbours), `family` the wz it is in, and where its words are in String.
   */
  place(k, id, folder) {
    const d = pad(id, KINDS[k].digits);
    if (k === 'map') return { rel: `Map/Map/Map${Math.floor(id / 100000000)}/${d}.img`, family: 'Map', string: 'Map', at: [regionOf(id), String(id)] };
    if (k === 'npc') return { rel: `Npc/${d}.img`, family: 'Npc', string: 'Npc', at: [String(id)] };
    if (k === 'equip') return { rel: `Character/${folder}/${d}.img`, family: 'Character', string: 'Eqp', at: ['Eqp', folder === 'TamingMob' ? 'Taming' : folder, String(id)] };
    if (k === 'quest') return { rel: 'Quest/QuestInfo.img', node: String(id), family: 'Quest', string: null, at: [] };
    const [dir, str] = ITEM_CATS[Math.floor(id / 1000000)];
    return { rel: `Item/${dir}/${d.slice(0, 4)}.img`, node: d, family: 'Item', string: str, at: str === 'Etc' ? ['Etc', String(id)] : [String(id)] };
  }
  /** The asset files a thing is in: [{ rel, node (its key there, or none: the whole file), part (which part of its tree goes there) }]. */
  filesOf(k, id, folder) {
    if (k === 'quest') return QUEST_PARTS.map((part) => ({ rel: `Quest/${part}.img`, node: String(id), part }));
    const p = this.place(k, id, folder);
    return [{ rel: p.rel, node: p.node, part: null }];
  }
  /** The assets' own: { tree, words, folder }, or null when they have none. */
  fromAssets(k, id) {
    if (k === 'quest') {
      const tree = {};
      for (const part of QUEST_PARTS) { const n = this.baseJson(`Quest/${part}.img`)?.[id]; if (n && typeof n === 'object') tree[part] = n; }
      return tree.QuestInfo ? { tree, words: {} } : null;
    }
    const folder = k === 'equip' ? this.folderOf(id) : undefined;
    if (k === 'equip' && !folder) return null;
    const p = this.place(k, id, folder), file = this.baseJson(p.rel);
    let tree = p.node ? file?.[p.node] : file;
    if (!tree || typeof tree !== 'object') return null;
    if (p.node) tree = inline(tree, [file, tree]);   // (an item's links lead to its neighbours: it takes copies, to stand alone)
    return { tree, words: this.wordsOf(k, id, folder), folder };
  }
  wordsOf(k, id, folder) {
    if (!KINDS[k].words.length) return {};
    let n = this.string(this.place(k, id, folder).string);
    if (k === 'map') { n = Object.values(n).find((region) => region?.[id])?.[id]; }
    else for (const key of this.place(k, id, folder).at) n = n?.[key];
    return Object.fromEntries(KINDS[k].words.map((w) => [w, typeof n?.[w] === 'string' ? n[w] : '']));
  }
  cleanWords(k, words) { return Object.fromEntries(KINDS[k].words.map((w) => [w, String(words?.[w] ?? '').slice(0, w === 'desc' ? 600 : 100)])); }

  // ---------------------------------------------------------------- opening, saving, publishing
  /** Whether the assets have one of this number (without reading it all: an item's file is looked through once). */
  inAssets(k, id) {
    if (k === 'equip') return !!this.folderOf(id);
    const p = this.place(k, id);
    if (!p.node) return fs.existsSync(this.baseFile(p.rel));
    this.groups ??= new Map();
    if (!this.groups.has(p.rel)) this.groups.set(p.rel, new Map(Object.entries(this.baseJson(p.rel) || {}).map(([key, v]) => [key, typeof v?.name === 'string' ? v.name : ''])));
    return this.groups.get(p.rel).has(p.node);
  }
  state(k, id) { return { assets: this.inAssets(k, id), draft: fs.existsSync(this.draftFile(k, id)), live: fs.existsSync(this.liveFile(k, id)) }; }
  /** What the editor opens: the draft if there is one, else what is published, else the assets' own. */
  open(k, id) {
    this.checkId(k, id);
    const state = this.state(k, id);
    for (const [from, file] of [['draft', this.draftFile(k, id)], ['live', this.liveFile(k, id)]]) {
      const rec = state[from] ? readJson(file) : null;
      if (rec?.tree) return { id, kind: k, tree: rec.tree, words: this.cleanWords(k, rec.words), folder: rec.folder, layout: rec.layout || null, dialogue: rec.dialogue || null, state, from, savedAt: rec.savedAt };
    }
    const own = this.fromAssets(k, id);
    if (!own) throw bad(`There is no ${k} ${id}.`, 404);
    return { id, kind: k, ...own, state, from: 'assets' };
  }
  save(k, id, body) {
    this.checkId(k, id);
    if (!body?.tree || typeof body.tree !== 'object' || Array.isArray(body.tree)) throw bad('That is not something to save.');
    let folder;
    if (k === 'equip') {
      folder = this.folderOf(id) || String(body.folder || '');
      if (!/^[A-Za-z]+$/.test(folder) || !fs.existsSync(path.join(this.assets, 'Character', folder))) throw bad('An equip of your own needs the kind it is (the folder of the one it was copied from).');
    }
    const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
    const dialogue = k === 'npc' && plain(body.dialogue) && Array.isArray(body.dialogue.nodes) && Array.isArray(body.dialogue.wires) ? body.dialogue : undefined;
    writeFile(this.draftFile(k, id), JSON.stringify({ id, kind: k, words: this.cleanWords(k, body.words), folder, tree: body.tree, layout: plain(body.layout), dialogue, savedAt: Date.now() }));
    return this.state(k, id);
  }
  discard(k, id) { this.checkId(k, id); fs.rmSync(this.draftFile(k, id), { force: true }); return this.state(k, id); }
  /** The draft becomes what players get. */
  publish(k, id) {
    this.checkId(k, id);
    const text = (() => { try { return fs.readFileSync(this.draftFile(k, id)); } catch { return null; } })();
    if (!text) throw bad('Save it first.');
    writeFile(this.liveFile(k, id), text);
    this.changed();
    return this.state(k, id);
  }
  /** Players get the assets' own again (or, for one of your own, nothing). */
  unpublish(k, id) { this.checkId(k, id); fs.rmSync(this.liveFile(k, id), { force: true }); this.changed(); return this.state(k, id); }
  changed() { this.index = null; this.texts.clear(); this.mirror(); }

  // ---------------------------------------------------------------- the customs folder
  /**
   * Brings the customs folder in step with what is published: every asset file a published thing stands in for or
   * is put into, the String files with its names, the pictures brought in and the map sets made of them. A file
   * the editor wrote that nothing accounts for any more is taken out; a file it did not write is never touched.
   */
  mirror() {
    const pub = this.published(), want = new Map();
    for (const rel of pub.files.keys()) { const tree = this.fileTree(rel); if (tree) want.set(`${rel}.json`, JSON.stringify(tree)); }
    for (const file of pub.strings.keys()) { const tree = this.stringTree(file); if (tree) want.set(`String/${file}.img.json`, JSON.stringify(tree)); }
    // the pictures brought in, where the trees that use them say they are (a tree's own folder, then _custom/...)
    for (const k of ['map', 'npc', 'equip', 'item']) {
      for (const p of this.pictures(k)) want.set(`${KINDS[k].family}/_custom/${KINDS[k].dir}/${p.name}.png`, { file: path.join(this.picDir(k), `${p.name}.png`) });
    }
    for (const set of ['Obj', 'Back']) { const tree = this.pictureSet(set); if (tree) want.set(`Map/${set}/${SET}.img.json`, JSON.stringify(tree)); }
    // a published NPC's dialogue, as the script the game server runs for it
    for (const t of pub.things) {
      if (t.k !== 'npc') continue;
      const rec = readJson(t.file), made = rec?.dialogue ? compileDialogue(rec.dialogue, t.id) : null;
      if (made?.script) want.set(`scripts/npc/${t.id}.js`, made.script);
    }
    // the music brought in, as a music set of the game's kind: its tracks, and the file listing them
    const tracks = this.tracks();
    for (const t of tracks) want.set(`Sound/${MUSIC}.img/${t.name}.mp3`, { file: path.join(this.musicDir(), `${t.name}.mp3`) });
    if (tracks.length) want.set(`Sound/${MUSIC}.img.json`, JSON.stringify(Object.fromEntries(tracks.map((t) => [t.name, { _sound: `${MUSIC}.img/${t.name}.mp3`, _ms: t.ms }]))));
    for (const rel of this.written()) {
      if (want.has(rel)) continue;
      fs.rmSync(path.join(this.customs, rel), { force: true });
      for (let d = path.dirname(rel); d && d !== '.'; d = path.dirname(d)) { try { fs.rmdirSync(path.join(this.customs, d)); } catch { break; } }
    }
    for (const [rel, what] of want) {
      const file = path.join(this.customs, rel), data = typeof what === 'string' ? Buffer.from(what) : fs.readFileSync(what.file);
      let same = false;
      try { same = fs.readFileSync(file).equals(data); } catch { /* not there yet */ }
      if (!same) writeFile(file, data);
    }
    this.wrote = new Set(want.keys());
    writeFile(this.writtenFile, JSON.stringify([...this.wrote].sort(), null, 1));
  }

  // ---------------------------------------------------------------- what is published, and serving it
  /** Every published thing by kind, and the asset files and String files they stand in for. */
  published() {
    if (this.index) return this.index;
    const things = [], files = new Map(), strings = new Map();
    for (const k of Object.keys(KINDS)) {
      const dir = path.join(this.dir, KINDS[k].dir, 'published');
      let names = [];
      try { names = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { /* none of this kind */ }
      for (const f of names) {
        const file = path.join(dir, f), id = Number(f.slice(0, -5));
        const rec = readJson(file);
        if (!rec?.tree || (k === 'equip' && !rec.folder)) continue;
        const p = this.place(k, id, rec.folder), thing = { k, id, file, p, parts: this.filesOf(k, id, rec.folder) };
        things.push(thing);
        for (const f of thing.parts) { if (!files.has(f.rel)) files.set(f.rel, []); files.get(f.rel).push(thing); }
        if (!p.string) continue;
        if (!strings.has(p.string)) strings.set(p.string, []);
        strings.get(p.string).push(thing);
      }
    }
    return (this.index = { things, files, strings });
  }
  /** An asset file (no .json) as players get it, as a tree; null when nothing published touches it. `extra` adds one more thing ({ k, id, rec }) for an export. */
  fileTree(rel, extra = null) {
    const more = extra ? { ...extra, parts: this.filesOf(extra.k, extra.id, extra.rec.folder) } : null;
    const list = [...(this.published().files.get(rel) || []).map((t) => ({ ...t, rec: readJson(t.file) })), ...(more && more.parts.some((f) => f.rel === rel) ? [more] : [])];
    if (!list.length) return null;
    const at = (t) => t.parts.find((f) => f.rel === rel);
    if (!at(list[0]).node) return list[list.length - 1].rec?.tree || null;
    // items and quests: the file the assets keep for these numbers (or an empty one), with yours in it
    const tree = this.baseJson(rel) || {};
    for (const t of list) {
      const f = at(t), value = f.part ? t.rec?.tree?.[f.part] : t.rec?.tree;
      if (!value || typeof value !== 'object') continue;
      tree[f.node] = value;
      if (Array.isArray(tree._order) && !tree._order.includes(f.node)) tree._order.push(f.node);
    }
    return tree;
  }
  /** A String file with the published words in it (and `extra`'s), as a tree; null when none touch it. */
  stringTree(file, extra = null) {
    if (!file) return null;
    const list = [...(this.published().strings.get(file) || []).map((t) => ({ ...t, rec: readJson(t.file) })), ...(extra && this.place(extra.k, extra.id, extra.rec.folder).string === file ? [{ ...extra, p: this.place(extra.k, extra.id, extra.rec.folder) }] : [])];
    if (!list.length) return null;
    const tree = structuredClone(this.string(file));
    for (const t of list) {
      if (!t.rec) continue;
      const words = this.cleanWords(t.k, t.rec.words);
      if (t.k === 'map') for (const region of Object.values(tree)) if (region && typeof region === 'object') delete region[t.id];
      let n = tree;
      for (const key of t.p.at.slice(0, -1)) n = (n[key] ??= {});
      const last = t.p.at[t.p.at.length - 1], had = n[last] && typeof n[last] === 'object' ? n[last] : {};
      n[last] = { ...had, ...words };
      for (const w of ['desc', 'func']) if (n[last][w] === '' && !(w in had)) delete n[last][w];   // (no empty lines added to one that had none)
    }
    return tree;
  }
  /** The sets made of the pictures brought in for maps: objects (custom / pictures / <name> / 0) and backgrounds. */
  pictureSet(which) {
    const pics = this.pictures('map');
    if (!pics.length) return null;
    const canvas = (p, origin) => ({ origin, z: 0, _w: p.w, _h: p.h, _canvas: `_custom/maps/${p.name}.png` });
    if (which === 'Obj') return { pictures: Object.fromEntries(pics.map((p) => [p.name, { 0: { 0: canvas(p, [Math.round(p.w / 2), p.h]) } }])) };
    return { back: Object.fromEntries(pics.map((p) => [String(p.no), canvas(p, [0, 0])])) };
  }
  /** Whether an asset file (no .json) is one of yours: the sheets' route leaves those to resolve(). */
  isLive(rel) { return this.published().files.has(rel); }
  /** What to send for a path under /assets: { text } (JSON), { file } (a picture), or null to go on to the assets. */
  resolve(url) {
    const pic = PIC_URL.exec(url);
    if (pic) { const file = path.join(this.dir, pic[1], 'pictures', `${pic[2]}.png`); return fs.existsSync(file) ? { file } : null; }
    if (!url.endsWith('.img.json')) return null;
    const rel = url.slice(1, -5), pub = this.published(), set = rel === `Map/Obj/${SET}.img` ? 'Obj' : rel === `Map/Back/${SET}.img` ? 'Back' : null;
    if (!set && !(rel.startsWith('String/') ? pub.strings.has(rel.slice(7, -4)) : pub.files.has(rel))) return null;   // (not one of yours)
    if (this.texts.has(rel)) return this.texts.get(rel);
    const tree = set ? this.pictureSet(set) : rel.startsWith('String/') ? this.stringTree(rel.slice(7, -4)) : this.fileTree(rel);
    const out = tree ? { text: JSON.stringify(tree) } : null;
    this.texts.set(rel, out);
    return out;
  }
  /** The files players get from here, each with a version: what the client asks for them by. */
  versions() {
    const out = {}, pub = this.published();
    for (const [rel, list] of pub.files) out[rel] = list.length > 3 ? `${list.length}.${list.map((t) => stamp(t.file)).sort().pop()}` : list.map((t) => stamp(t.file)).join('.');
    for (const [file, list] of pub.strings) out[`String/${file}.img`] = list.map((t) => stamp(t.file)).sort().pop();
    if (this.pictures('map').length) { const v = stamp(path.join(this.dir, 'maps', 'pictures')); out[`Map/Obj/${SET}.img`] = v; out[`Map/Back/${SET}.img`] = v; }
    return out;
  }

  // ---------------------------------------------------------------- finding
  own(k) {
    const own = new Map(), kind = KINDS[k];
    const scan = (dir, key) => { try { for (const f of fs.readdirSync(dir)) if (/^\d+\.json$/.test(f)) { const id = Number(f.slice(0, -5)); own.set(id, { ...(own.get(id) || {}), [key]: true }); } } catch { /* none yet */ } };
    scan(path.join(this.dir, kind.dir), 'draft'); scan(path.join(this.dir, kind.dir, 'published'), 'live');
    return own;
  }
  /** Things of a kind by number or by a word in their name; with nothing asked for, your own. Rows: { id, name, sub, draft, live }. */
  search(k, q, limit = 60) {
    this.kind(k);
    const own = this.own(k), words = String(q || '').trim().toLowerCase(), out = [], seen = new Set();
    const add = (id, name, sub) => { if (!seen.has(id) && out.length < limit) { seen.add(id); out.push({ id, name: name || '', sub: sub || '', draft: !!own.get(id)?.draft, live: !!own.get(id)?.live }); } };
    const hit = (id, name, sub) => !words || String(id).startsWith(words) || `${sub || ''} ${name || ''}`.toLowerCase().includes(words);
    for (const id of [...own.keys()].sort((a, b) => a - b)) {
      const rec = readJson(own.get(id).draft ? this.draftFile(k, id) : this.liveFile(k, id)), w = rec?.words || {};
      const name = k === 'map' ? w.mapName : k === 'quest' ? rec?.tree?.QuestInfo?.name : w.name, sub = k === 'map' ? w.streetName : k === 'equip' ? rec?.folder : '';
      if (hit(id, name, sub)) add(id, name, sub);
    }
    if (!words) return out;
    if (k === 'map') { for (const region of Object.values(this.string('Map'))) for (const [id, n] of Object.entries(region || {})) if (n && typeof n === 'object' && hit(id, n.mapName, n.streetName)) add(Number(id), n.mapName, n.streetName); }
    else if (k === 'npc') { for (const [id, n] of Object.entries(this.string('Npc'))) if (hit(id, n?.name, n?.func)) add(Number(id), n?.name, n?.func); }
    else if (k === 'equip') { for (const [folder, list] of Object.entries(this.string('Eqp').Eqp || {})) for (const [id, n] of Object.entries(list || {})) if (hit(id, n?.name, folder)) add(Number(id), n?.name, folder === 'Taming' ? 'TamingMob' : folder); }
    else if (k === 'quest') { this.inAssets('quest', 1); for (const [id, name] of this.groups.get('Quest/QuestInfo.img')) if (/^\d+$/.test(id) && hit(id, name, '')) add(Number(id), name, ''); }
    else for (const [dir, str] of Object.values(ITEM_CATS)) { const list = str === 'Etc' ? this.string('Etc').Etc : this.string(str); for (const [id, n] of Object.entries(list || {})) if (hit(id, n?.name, dir)) add(Number(id), n?.name, dir); }
    return out;
  }
  /** The names of the files in a folder of the assets (tile sets, object sets, backgrounds, reactors); your pictures' set first. */
  sets(rel) {
    const names = new Set();
    for (const dir of [this.assets, this.customs]) { try { for (const f of fs.readdirSync(path.join(dir, rel))) if (f.endsWith('.img.json') && f !== `${SET}.img.json`) names.add(f.slice(0, -9)); } catch { /* none */ } }
    const list = [...names].sort();
    return (rel === 'Map/Obj' || rel === 'Map/Back') && this.pictures('map').length ? [SET, ...list] : list;
  }

  // ---------------------------------------------------------------- pictures
  picDir(k) { return path.join(this.dir, this.kind(k).dir, 'pictures'); }
  /** The pictures brought in for a kind: [{ name, w, h, bytes, at, no }] (no: its number in the background set, maps only). */
  pictures(k) {
    const dir = this.picDir(k), key = `${k}:${stamp(dir)}`;
    if (this.pics.get(k)?.key === key) return this.pics.get(k).list;
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && PIC_NAME.test(f.slice(0, -4))).sort(); } catch { /* none yet */ }
    const numbers = k === 'map' ? readJson(path.join(dir, 'numbers.json')) || {} : null;
    const list = [];
    for (const f of names) {
      const file = path.join(dir, f);
      let size = null, st = null;
      try { st = fs.statSync(file); const fd = fs.openSync(file, 'r'), head = Buffer.alloc(33); fs.readSync(fd, head, 0, 33, 0); fs.closeSync(fd); size = pngSize(head); } catch { /* unreadable */ }
      if (size) list.push({ name: f.slice(0, -4), ...size, bytes: st.size, at: Math.round(st.mtimeMs), no: numbers ? numbers[f.slice(0, -4)] ?? null : undefined });
    }
    this.pics.set(k, { key, list });
    return list;
  }
  addPicture(k, name, buf) {
    if (!PIC_NAME.test(name)) throw bad('A picture’s name is letters, digits, - and _, up to 40 of them.');
    if (!Buffer.isBuffer(buf) || !pngSize(buf)) throw bad('That is not a PNG picture (or it is larger than 8192 pixels a side).');
    const dir = this.picDir(k);
    writeFile(path.join(dir, `${name}.png`), buf);
    if (k === 'map') {   // its number among the backgrounds is its own for good, so a map that uses it keeps pointing at it
      const file = path.join(dir, 'numbers.json'), numbers = readJson(file) || {};
      if (!(name in numbers)) { numbers[name] = Object.values(numbers).reduce((m, n) => Math.max(m, n + 1), 0); writeFile(file, JSON.stringify(numbers)); }
    }
    this.pics.delete(k); this.changed();
    return this.pictures(k).find((p) => p.name === name);
  }
  removePicture(k, name) {
    if (!PIC_NAME.test(name)) throw bad('No such picture.', 404);
    fs.rmSync(path.join(this.picDir(k), `${name}.png`), { force: true });
    this.pics.delete(k); this.changed();
  }
}

// ---------------------------------------------------------------- music
Object.assign(CustomStore.prototype, {
  musicDir() { return path.join(this.dir, 'music'); },
  /** The tracks brought in: [{ name, ms, bytes, at }]. */
  tracks() {
    const dir = this.musicDir(), key = `${stamp(dir)}:${stamp(path.join(dir, 'lengths.json'))}`;
    if (this.trackList?.key === key) return this.trackList.list;
    const lengths = readJson(path.join(dir, 'lengths.json')) || {};
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3') && PIC_NAME.test(f.slice(0, -4))).sort(); } catch { /* none yet */ }
    const list = [];
    for (const f of names) {
      try { const st = fs.statSync(path.join(dir, f)), name = f.slice(0, -4); list.push({ name, ms: Number(lengths[name]) || 0, bytes: st.size, at: Math.round(st.mtimeMs) }); } catch { /* gone */ }
    }
    this.trackList = { key, list };
    return list;
  },
  /** A track brought in (an MP3), `ms` long; one of the same name is replaced. */
  addTrack(name, buf, ms) {
    if (!PIC_NAME.test(name)) throw bad('A track’s name is letters, digits, - and _, up to 40 of them.');
    if (!isMp3(buf)) throw bad('That is not an MP3 file.');
    const dir = this.musicDir();
    writeFile(path.join(dir, `${name}.mp3`), buf);
    const file = path.join(dir, 'lengths.json'), lengths = readJson(file) || {};
    lengths[name] = Number.isFinite(ms) && ms > 0 && ms <= MOST_MUSIC_MS ? Math.round(ms) : 0;
    writeFile(file, JSON.stringify(lengths));
    this.trackList = null; this.changed();
    return this.tracks().find((t) => t.name === name);
  },
  removeTrack(name) {
    if (!PIC_NAME.test(name)) throw bad('No such track.', 404);
    const dir = this.musicDir(), file = path.join(dir, 'lengths.json'), lengths = readJson(file) || {};
    fs.rmSync(path.join(dir, `${name}.mp3`), { force: true });
    if (name in lengths) { delete lengths[name]; writeFile(file, JSON.stringify(lengths)); }
    this.trackList = null; this.changed();
  },
  /** The music a map can play: the game's sets (Sound/Bgm*.img), each with its tracks, and the tracks brought in. */
  music() {
    if (!this.gameMusic) {
      const sets = new Map();
      for (const dir of [this.assets, this.customs]) {
        let files = [];
        try { files = fs.readdirSync(path.join(dir, 'Sound')).filter((f) => /^Bgm.*\.img\.json$/.test(f) && f !== `${MUSIC}.img.json`); } catch { /* none */ }
        for (const f of files) {
          if (dir === this.customs && this.written().has(`Sound/${f}`)) continue;
          const tree = readJson(path.join(dir, 'Sound', f)) || {};
          sets.set(f.slice(0, -9), Object.keys(tree).filter((k) => !k.startsWith('_') && tree[k]?._sound).sort((a, b) => a.localeCompare(b)));
        }
      }
      this.gameMusic = [...sets].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([set, names]) => ({ set, names })).filter((s) => s.names.length);
    }
    return { own: MUSIC, tracks: this.tracks(), sets: this.gameMusic };
  },
});

// ---------------------------------------------------------------- monsters and NPCs made as files of the customs folder
const LIFE = { npc: 'Npc', mob: 'Mob' };
/** A monster's file or one of its pictures, as a map's zip brings them: Mob/<7 digits>.img.json, Mob/<7 digits>.img/.../x.png. */
const MOB_FILE = /^Mob\/\d{7}\.img(?:\.json|(?:\/[A-Za-z0-9_-]+)+\.png)$/;
Object.assign(CustomStore.prototype, {
  /**
   * A monster or an NPC by number: whether the assets have it, whether the editor has one of its own (NPCs), the files
   * of the customs folder that make it (its file and its pictures; never ones the editor wrote), and its name.
   */
  life(kind, id) {
    const family = LIFE[kind];
    if (!family) throw bad('No such kind.', 404);
    if (!Number.isInteger(id) || id < 0 || id > 9999999) throw bad('That is not a number.');
    const rel = `${family}/${pad(id, 7)}.img`, files = [];
    if (fs.existsSync(path.join(this.customs, `${rel}.json`)) && !this.written().has(`${rel}.json`)) {
      files.push(`${rel}.json`);
      const walk = (dir, at) => {
        let list = [];
        try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of list) {
          const r = `${at}/${e.name}`;
          if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (e.name.endsWith('.png') && !this.written().has(r)) files.push(r);
        }
      };
      walk(path.join(this.customs, rel), rel);
    }
    const n = this.string(family)?.[String(id)], st = kind === 'npc' ? this.state('npc', id) : null;
    return {
      assets: fs.existsSync(path.join(this.assets, `${rel}.json`)), own: !!st && (st.draft || st.live), files,
      name: n && typeof n === 'object' ? { name: String(n.name ?? ''), ...(kind === 'npc' ? { func: String(n.func ?? '') } : {}) } : null,
    };
  },
  /** Puts a monster's file or picture in the customs folder as one of yours (the editor never takes it out again). */
  putMobFile(rel, buf) {
    if (!MOB_FILE.test(rel)) throw bad('Only a monster’s file or one of its pictures is put in this way.');
    if (this.written().has(rel)) throw bad('That is a file the editor wrote itself.');
    if (rel.endsWith('.json')) {
      let tree = null;
      try { tree = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : ''); } catch { /* not JSON */ }
      if (!tree || typeof tree !== 'object' || Array.isArray(tree)) throw bad('That is not a monster’s file.');
    } else if (!pngSize(buf)) throw bad('That is not a PNG picture.');
    writeFile(path.join(this.customs, rel), buf);
  },
  /** Puts monsters' names ({ id: { name } }) into String/Mob.img of the customs folder (made from the assets' when it has none). */
  putMobNames(names) {
    const rel = 'String/Mob.img';
    if (this.written().has(`${rel}.json`)) throw bad('The editor wrote that file itself.');
    const tree = structuredClone(this.baseJson(rel) || {});
    let n = 0;
    for (const [id, v] of Object.entries(names || {})) {
      if (!/^\d{1,7}$/.test(id)) continue;
      const key = String(Number(id));
      tree[key] = { ...(tree[key] && typeof tree[key] === 'object' ? tree[key] : {}), name: String(v?.name ?? '').slice(0, 100) };
      n++;
    }
    if (n) { writeFile(path.join(this.customs, `${rel}.json`), JSON.stringify(tree)); delete this.strings.Mob; }
  },
});

/** A copy of `node` in which every link is replaced by a copy of what it leads to (`chain`: the nodes from the file's root down to it). */
function inline(node, chain) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object' && typeof v._uol === 'string') {
      let stack = chain.slice();
      for (const seg of v._uol.split('/')) { if (seg === '..') stack.pop(); else if (seg && seg !== '.') stack.push(stack[stack.length - 1]?.[seg]); }
      const target = stack[stack.length - 1];
      out[k] = target && typeof target === 'object' && typeof target._uol !== 'string' ? inline(target, stack) : undefined;
      if (out[k] === undefined) delete out[k];
    } else out[k] = v && typeof v === 'object' && !Array.isArray(v) ? inline(v, [...chain, v]) : v;
  }
  return out;
}

/** Puts the pictures brought in, and what is published, in front of the assets on the editor's web server. */
export function serveCustom(app, store, guard = (req, res, next) => next()) {
  app.use('/assets', guard, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { next(); return; }
    let hit = null;
    try { hit = store.resolve(decodeURIComponent(req.path)); } catch (e) { console.error(`Custom: ${req.path} left to the assets (${e.message})`); }
    if (!hit) { next(); return; }
    res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (hit.file) res.sendFile(hit.file, { dotfiles: 'allow', cacheControl: false }); else res.type('json').send(hit.text);
  });
}

/** The editor page's routes for all of it. */
export function customRoutes(api, guard, store) {
  const wrap = (fn) => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };
  const ids = (req) => { if (!/^\d{1,9}$/.test(req.params.id)) throw bad('That is not a number.'); return [req.params.kind, Number(req.params.id)]; };
  api.get('/c/:kind', guard, wrap((req, res) => res.json(store.search(req.params.kind, req.query.q))));
  api.get('/c/:kind/:id', guard, wrap((req, res) => res.json(store.open(...ids(req)))));
  api.get('/c/:kind/:id/state', guard, wrap((req, res) => { const [k, id] = ids(req); store.checkId(k, id); res.json({ ...store.state(k, id), folder: k === 'equip' ? store.folderOf(id) : undefined }); }));
  api.put('/c/:kind/:id', guard, wrap((req, res) => res.json(store.save(...ids(req), req.body))));
  api.delete('/c/:kind/:id/draft', guard, wrap((req, res) => res.json(store.discard(...ids(req)))));
  api.post('/c/:kind/:id/publish', guard, wrap((req, res) => { const [k, id] = ids(req); if (req.body?.tree) store.save(k, id, req.body); res.json(store.publish(k, id)); console.log(`${k} ${id} published to ${store.customs}`); }));
  api.delete('/c/:kind/:id/live', guard, wrap((req, res) => { const [k, id] = ids(req); res.json(store.unpublish(k, id)); console.log(`${k} ${id} no longer published`); }));
  api.get('/custom', guard, wrap((req, res) => res.json({ dir: store.dir, customs: store.customs, kinds: Object.fromEntries(Object.keys(KINDS).map((k) => { const own = [...store.own(k).values()]; return [k, { drafts: own.filter((o) => o.draft).length, published: own.filter((o) => o.live).length, pictures: store.pictures(k).length }]; })) })));
  api.get('/sets/:kind', guard, wrap((req, res) => {
    const rel = { tile: 'Map/Tile', obj: 'Map/Obj', back: 'Map/Back', reactor: 'Reactor' }[req.params.kind];
    if (!rel) throw bad('No such list.', 404);
    res.json(store.sets(rel));
  }));
  // monsters by number or name (the map editor's picker; they have no editor of their own)
  api.get('/names/mob', guard, wrap((req, res) => {
    const words = String(req.query.q || '').trim().toLowerCase(), out = [];
    for (const [id, v] of Object.entries(store.string('Mob'))) { const name = String(v?.name ?? ''); if (!words || id.startsWith(words) || name.toLowerCase().includes(words)) { out.push({ id: Number(id), name }); if (out.length >= 60) break; } }
    res.json(out);
  }));
  api.get('/pictures/:kind', guard, wrap((req, res) => res.json(store.pictures(req.params.kind))));
  api.put('/pictures/:kind/:name', guard, express.raw({ type: 'image/png', limit: '12mb' }), wrap((req, res) => { res.json(store.addPicture(req.params.kind, req.params.name, req.body)); console.log(`picture ${req.params.name} brought in for ${KINDS[req.params.kind].dir}`); }));
  api.delete('/pictures/:kind/:name', guard, wrap((req, res) => { store.removePicture(req.params.kind, req.params.name); res.json({ ok: true }); }));
  // monsters and NPCs made as files of the customs folder: what a map's zip takes and brings
  api.get('/life/:kind/:id', guard, wrap((req, res) => { if (!/^\d{1,7}$/.test(req.params.id)) throw bad('That is not a number.'); res.json(store.life(req.params.kind, Number(req.params.id))); }));
  api.put(/^\/customs\/(Mob\/.+)$/, guard, express.raw({ type: () => true, limit: '20mb' }), wrap((req, res) => { store.putMobFile(req.params[0], req.body); res.json({ ok: true }); }));
  api.post('/strings/mob', guard, wrap((req, res) => { store.putMobNames(req.body); res.json({ ok: true }); }));
  // music for maps: the game's and your own; an MP3 brought in (its length, measured by the page, in ?ms)
  api.get('/music', guard, wrap((req, res) => res.json(store.music())));
  api.put('/music/:name', guard, express.raw({ type: 'audio/mpeg', limit: '40mb' }), wrap((req, res) => { res.json(store.addTrack(req.params.name, req.body, Number(req.query.ms))); console.log(`music ${req.params.name} brought in`); }));
  api.delete('/music/:name', guard, wrap((req, res) => { store.removeTrack(req.params.name); res.json({ ok: true }); }));
}
