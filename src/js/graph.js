/**
 * The link graph: wikilink parsing, forward and backlinks, and the edge list the
 * graph view draws.
 *
 * Virtual notes (tag searches) are registered separately from NOTES. They get
 * their own ids so two tag searches never overwrite each other, and they stay
 * out of EDGES so a search cannot reshape the graph.
 */

import { NOTES } from './notes.js';

// Re-exported so consumers have one import for "the vault and its graph".
export { NOTES };

const WIKILINK = /\[\[([a-z0-9:-]+)(?:\|([^\]]+))?\]\]/g;

export const byId = new Map();
export const OUT = new Map();
export const BACK = new Map();
export const EDGES = [];
export const FOLDERS = [];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Wikilink targets in a body, in order, de-duplicated, resolvable only. */
function linkTargets(body) {
  const seen = new Set();
  WIKILINK.lastIndex = 0;
  let match;
  while ((match = WIKILINK.exec(body)) !== null) seen.add(match[1]);
  return [...seen];
}

for (const note of NOTES) {
  byId.set(note.id, note);
  BACK.set(note.id, []);
  if (!FOLDERS.includes(note.folder)) FOLDERS.push(note.folder);
}

for (const note of NOTES) {
  const targets = linkTargets(note.body).filter((id) => byId.has(id));
  OUT.set(note.id, targets);
  for (const target of targets) BACK.get(target).push(note.id);
}

{
  const seen = new Set();
  for (const note of NOTES) {
    for (const target of OUT.get(note.id)) {
      // One edge per unordered pair: a mutual link is still one line.
      const key = note.id < target ? `${note.id}|${target}` : `${target}|${note.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      EDGES.push([note.id, target]);
    }
  }
}

export const outgoing = (id) => OUT.get(id) ?? [];
export const backlinks = (id) => BACK.get(id) ?? [];
export const isVirtual = (id) => byId.has(id) && byId.get(id).virtual === true;

/**
 * Register a generated note (a tag search). Keyed by its own id, so opening
 * #moc and then #paper leaves both panes intact.
 */
export function registerVirtual(note) {
  byId.set(note.id, { ...note, virtual: true });
  OUT.set(note.id, linkTargets(note.body).filter((id) => byId.has(id)));
  if (!BACK.has(note.id)) BACK.set(note.id, []);
  return note.id;
}

/** Replace [[id|label]] with an anchor; unresolved targets render as flagged text. */
export function renderBody(body) {
  return body.replace(WIKILINK, (_, id, label) => {
    const note = byId.get(id);
    const text = escapeHtml(label ?? note?.title ?? id);
    return note
      ? `<a class="wl" href="#${encodeURIComponent(id)}" data-open="${escapeHtml(id)}">${text}</a>`
      : `<span class="wl unres" title="No note with id &quot;${escapeHtml(id)}&quot;">${text}</span>`;
  });
}

/** Body text with markup stripped, for the hover preview. */
export function plainText(id) {
  const note = byId.get(id);
  if (!note) return '';
  const host = document.createElement('div');
  host.innerHTML = renderBody(note.body);
  return host.textContent.replace(/\s+/g, ' ').trim();
}
