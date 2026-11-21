/**
 * An NPC's dialogue, as the editor draws it (a graph of nodes and wires), made into the script Voyage-Server runs when
 * a player talks to the NPC (customs/scripts/npc/<number>.js). Used by the page, to show it, and by the editor's
 * server, to publish it, so both make the same one.
 *
 * The nodes: start (where talking begins), say (a line: Next when something follows, OK when nothing does), ask
 * (Yes / No), choice (a list to pick from, one way out for each), check (a test: yes or no), act (gives, takes or
 * moves, then goes on; opening the NPC's shop ends the talk) and end. Checks and acts run as they are reached; the next say, ask or choice is shown.
 */

/** What a check can test, and what an act can do, each with the values it takes. */
export const CHECKS = {
  level: { label: 'Level is at least', n: 'Level' },
  job: { label: 'Job is', n: 'Job number' },
  item: { label: 'Has an item', id: 'Item', n: 'How many' },
  meso: { label: 'Has mesos', n: 'Mesos' },
  questStarted: { label: 'Has started a quest', id: 'Quest' },
  questDone: { label: 'Has finished a quest', id: 'Quest' },
  gender: { label: 'Is', n: 'Gender (0 male, 1 female)' },
  canHold: { label: 'Has room for an item', id: 'Item', n: 'How many' },
};
export const ACTS = {
  item: { label: 'Give an item (a count below 0 takes)', id: 'Item', n: 'How many' },
  meso: { label: 'Give mesos (below 0 takes)', n: 'Mesos' },
  exp: { label: 'Give EXP', n: 'EXP' },
  fame: { label: 'Give fame', n: 'Fame' },
  warp: { label: 'Send to a map', id: 'Map', portal: 'Portal (optional)' },
  startQuest: { label: 'Start a quest', id: 'Quest' },
  completeQuest: { label: 'Finish a quest', id: 'Quest' },
  shop: { label: 'Open its shop (the talk ends)' },
};
/** Each kind of node's ways out (choice has one for each of its options: o0, o1...). */
export const OUTS = { start: ['next'], say: ['next'], ask: ['yes', 'no'], check: ['yes', 'no'], act: ['next'], end: [] };
export const outsOf = (node) => (node.type === 'choice' ? (node.data?.options || []).map((_, i) => `o${i}`) : OUTS[node.type] || []);

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const words = (v) => String(v ?? '').replace(/\r?\n/g, '\r\n');

/**
 * The script for a dialogue graph ({ nodes, wires }), and what is wrong with the graph ({ script, problems });
 * script is null when there is nothing to say (no start, or nothing after it).
 */
export function compileDialogue(graph, npcId) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [], wires = Array.isArray(graph?.wires) ? graph.wires : [];
  const byId = new Map(nodes.map((n) => [String(n.id), n])), problems = [];
  const to = (id, out) => { const w = wires.find((x) => String(x.from?.[0]) === String(id) && x.from?.[1] === out); return w && byId.has(String(w.to?.[0])) ? String(w.to[0]) : null; };
  const start = nodes.find((n) => n.type === 'start');
  if (!start) return { script: null, problems: ['There is no start.'] };
  const first = to(start.id, 'next');
  if (!first) return { script: null, problems: ['Nothing follows the start.'] };
  const out = {};
  for (const n of nodes) {
    const d = n.data || {}, id = String(n.id);
    if (n.type === 'say') out[id] = { t: 'say', text: words(d.text), next: to(id, 'next') };
    else if (n.type === 'ask') out[id] = { t: 'ask', text: words(d.text), yes: to(id, 'yes'), no: to(id, 'no') };
    else if (n.type === 'choice') {
      const options = (d.options || []).map((o) => words(o));
      out[id] = { t: 'choice', text: words(d.text), labels: options, opts: options.map((_, i) => to(id, `o${i}`)) };
      if (!options.length) problems.push('A choice has no options.');
    } else if (n.type === 'check') {
      if (!CHECKS[d.what]) { problems.push('A check doesn’t say what it tests.'); continue; }
      out[id] = { t: 'check', what: d.what, id: int(d.id), n: int(d.n), yes: to(id, 'yes'), no: to(id, 'no') };
    } else if (n.type === 'act') {
      if (!ACTS[d.what]) { problems.push('An action doesn’t say what it does.'); continue; }
      out[id] = { t: 'act', what: d.what, id: int(d.id), n: int(d.n), portal: String(d.portal ?? '').trim(), next: to(id, 'next') };
    } else if (n.type === 'end') out[id] = { t: 'end' };
    if (['say', 'ask', 'choice'].includes(n.type) && !String(d.text ?? '').trim()) problems.push(`A ${n.type === 'say' ? 'line' : n.type === 'ask' ? 'question' : 'choice'} has nothing to say.`);
  }
  const script = `/*
 * NPC ${int(npcId)}'s dialogue, made by Voyage-Editor from the graph drawn there: change it there, not here (publishing
 * it again writes this file over).
 */
var at = null;
var nodes = ${JSON.stringify(out)};

function start() {
    at = null;
    go(${JSON.stringify(first)});
}

function action(mode, type, selection) {
    var n = nodes[at];
    if (!n || mode == -1) { cm.dispose(); return; }
    if (n.t == 'say') { if (mode == 1 && n.next != null) go(n.next); else cm.dispose(); return; }
    if (n.t == 'ask') { go(mode == 1 ? n.yes : n.no); return; }
    if (n.t == 'choice') { if (mode == 1 && selection >= 0 && selection < n.opts.length) go(n.opts[selection]); else cm.dispose(); return; }
    cm.dispose();
}

function go(id) {
    for (var steps = 0; steps < 200; steps++) {
        var n = id == null ? null : nodes[id];
        if (!n || n.t == 'end') { cm.dispose(); return; }
        if (n.t == 'check') { id = test(n) ? n.yes : n.no; continue; }
        if (n.t == 'act' && n.what == 'shop') { cm.openAdminShop(); cm.dispose(); return; }
        if (n.t == 'act') { act(n); id = n.next; continue; }
        at = id;
        if (n.t == 'say') { if (n.next != null) cm.sendNext(n.text); else cm.sendOk(n.text); }
        else if (n.t == 'ask') cm.sendYesNo(n.text);
        else {
            var s = n.text;
            for (var i = 0; i < n.labels.length; i++) s += "\\r\\n#L" + i + "#" + n.labels[i] + "#l";
            cm.sendSimple(s);
        }
        return;
    }
    cm.dispose();
}

function test(n) {
    switch (n.what) {
        case 'level': return cm.getLevel() >= n.n;
        case 'job': return cm.getJobId() == n.n;
        case 'item': return cm.haveItem(n.id, Math.max(1, n.n));
        case 'meso': return cm.getMeso() >= n.n;
        case 'questStarted': return cm.isQuestStarted(n.id);
        case 'questDone': return cm.isQuestCompleted(n.id);
        case 'gender': return cm.getPlayer().getGender() == n.n;
        case 'canHold': return cm.canHold(n.id, Math.max(1, n.n));
    }
    return false;
}

function act(n) {
    switch (n.what) {
        case 'item': cm.gainItem(n.id, n.n); break;
        case 'meso': cm.gainMeso(n.n); break;
        case 'exp': cm.gainExp(n.n); break;
        case 'fame': cm.gainFame(n.n); break;
        case 'warp': if (n.portal) cm.warp(n.id, n.portal); else cm.warp(n.id); break;
        case 'startQuest': cm.forceStartQuest(n.id); break;
        case 'completeQuest': cm.forceCompleteQuest(n.id); break;
    }
}
`;
  return { script, problems };
}
