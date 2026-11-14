/**
 * Music for maps: the game's music sets and tracks of your own. An MP3 brought in is kept in the editor's data folder
 * and copied at once into the customs folder as the music set BgmCustom (Sound/BgmCustom.img), so a map plays it as
 * BgmCustom/<name>, the way it plays the game's Bgm00/GoPicnic. Players hear it once the map that plays it is
 * published.
 */
import { h, fill, fmt, toast } from './ui.js';
import { api, sendFile } from './api.js';

/** A map's music ("Bgm00/GoPicnic") as the file it is. */
export const musicUrl = (bgm) => { const [set, ...name] = String(bgm || '').split('/'); return `/assets/Sound/${set}.img/${name.join('/')}.mp3`; };
const cleanName = (n) => n.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 40) || 'track';
const isMp3File = (f) => f.type === 'audio/mpeg' || /\.mp3$/i.test(f.name);
/** A track's length as minutes and seconds: "3:07". */
export const trackLength = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let listing = null;
/** The music a map can play ({ own, tracks, sets }), asked once and again after a track comes or goes. */
export function musicList(again = false) {
  if (again || !listing) listing = api('/music').catch((e) => { listing = null; throw e; });
  return listing;
}

/** How long an audio file plays, in ms (0 when the browser can't tell; -1 when it can't play it). */
function lengthOf(file) {
  return new Promise((done) => {
    const url = URL.createObjectURL(file), el = new Audio();
    const end = (ms) => { URL.revokeObjectURL(url); done(ms); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => end(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
    el.onerror = () => end(-1);
    el.src = url;
  });
}

/** Brings an MP3 in; resolves the name it is kept by (its file's), or throws saying why not. */
export async function importTrack(file) {
  if (!isMp3File(file)) throw new Error('it is not an MP3 file');
  if (file.size > 40 * 1024 * 1024) throw new Error('it is larger than 40 MB');
  const ms = await lengthOf(file);
  if (ms < 0) throw new Error('the browser could not play it');
  const name = cleanName(file.name);
  await sendFile(`/music/${name}?ms=${ms}`, file, 'audio/mpeg');
  musicList(true);
  return name;
}

/** One player for every preview: a track plays (over and over) until it is stopped or another one starts. */
export const preview = {
  el: null, bgm: null,
  play(bgm) {
    this.stop();
    const el = (this.el = new Audio(musicUrl(bgm)));
    el.loop = true; el.volume = 0.6; this.bgm = bgm;
    el.play().catch(() => { if (this.el === el) { this.stop(); toast(`${bgm} could not be played.`, true); } });
  },
  stop() { this.el?.pause(); this.el = null; this.bgm = null; },
  playing(bgm) { return !!bgm && this.bgm === bgm; },
};
/** A Play / Stop button for whatever `bgm()` gives. */
export function playButton(bgm) {
  const b = h('button', { type: 'button', onclick: () => { const v = bgm(); if (preview.playing(v)) preview.stop(); else if (v) preview.play(v); label(); } });
  const label = () => { b.textContent = preview.playing(bgm()) ? 'Stop' : 'Play'; };
  label();
  return Object.assign(b, { label });
}

/** The Import tab's music: MP3s brought in, each with Play and Delete. */
export function musicPanel() {
  const list = h('div', { class: 'track-list' }), where = h('p', { class: 'muted' });
  const refresh = async () => {
    const [m, info] = await Promise.all([musicList(true), api('/custom')]);
    where.textContent = 'Pick one for a map under Music in the map editor (or use Import MP3... there).';
    fill(list, m.tracks.length ? m.tracks.map((t) => {
      const bgm = `${m.own}/${t.name}`;
      return h('div', { class: 'track' }, h('strong', null, t.name), h('span', { class: 'muted' }, `${t.ms ? `${trackLength(t.ms)}, ` : ''}${fmt.bytes(t.bytes)}`),
        Object.assign(playButton(() => bgm), { className: 'quiet' }),
        h('button', { type: 'button', class: 'quiet danger', onclick: async () => {
          if (!confirm(`Delete the track ${t.name}? A map that plays it will have no music.`)) return;
          if (preview.playing(bgm)) preview.stop();
          try { await api(`/music/${t.name}`, { method: 'DELETE' }); refresh(); } catch (e) { toast(e.message, true); }
        } }, 'Delete'));
    }) : h('p', { class: 'empty' }, 'No music here yet.'));
  };
  const take = async (files) => {
    let ok = 0;
    for (const file of files) { try { await importTrack(file); ok++; } catch (e) { toast(`${file.name} was not brought in: ${e.message}.`, true); } }
    if (ok) toast(`${ok} track${ok === 1 ? '' : 's'} brought in.`);
    refresh().catch(() => {});
  };
  const input = h('input', { type: 'file', accept: '.mp3,audio/mpeg', multiple: true, hidden: true, onchange: (e) => { take([...e.target.files]); e.target.value = ''; } });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': 'Bring music in',
    onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); take([...e.dataTransfer.files].filter(isMp3File)); } },
  h('strong', null, 'Drop MP3 files here, or click to choose them'), h('span', { class: 'muted' }, 'A track is named after its file; one of the same name is replaced. Up to 40 MB each.'));
  const panel = h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, h('h2', null, 'Music of your own')), drop, input, where, list);
  return { panel, refresh };
}
