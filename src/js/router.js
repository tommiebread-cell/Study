/**
 * Navigation state: the stack of open panes and which one has focus.
 *
 * Kept separate from rendering so the graph view, palette and explorer can all
 * navigate without importing the pane renderer (and without a cycle).
 */

import { byId, isVirtual } from './graph.js';

const listeners = new Set();

let stack = [];
let active = 0;

export const openPanes = () => stack.slice();
export const activeIndex = () => active;
export const currentId = () => stack[active];

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) fn({ stack: stack.slice(), active, reason });
  syncHash();
}

function syncHash() {
  const id = stack[active];
  // Virtual notes (tag searches) are session-local, so they are not addressable.
  const hash = id && !isVirtual(id) ? `#${encodeURIComponent(id)}` : '';
  if (location.hash !== hash) {
    history.replaceState(null, '', hash || location.pathname + location.search);
  }
}

/**
 * Open a note. Without `fromIndex` it replaces the stack; with one, it opens to
 * the right of that pane, truncating anything further right — the Obsidian
 * behaviour, where the trail you followed stays visible.
 */
export function openNote(id, fromIndex) {
  if (!byId.has(id)) return false;

  if (fromIndex === undefined || fromIndex === null) {
    stack = [id];
  } else {
    const base = Math.max(0, Math.min(fromIndex, stack.length - 1));
    stack = stack.slice(0, base + 1);
    if (stack[base] !== id) stack.push(id);
  }

  active = stack.length - 1;
  emit('open');
  return true;
}

export function focusPane(index) {
  if (index < 0 || index >= stack.length || index === active) return;
  active = index;
  emit('focus');
}

export function closePane(index) {
  if (stack.length <= 1 || index < 0 || index >= stack.length) return;
  stack.splice(index, 1);
  if (active >= stack.length) active = stack.length - 1;
  else if (index < active) active -= 1;
  emit('close');
}

export function closeOthers() {
  if (stack.length <= 1) return;
  stack = [stack[active]];
  active = 0;
  emit('close');
}

/** Boot from the URL hash, falling back to the map of content. */
export function start(fallbackId) {
  const fromHash = decodeURIComponent(location.hash.slice(1));
  openNote(byId.has(fromHash) ? fromHash : fallbackId);
}

addEventListener('hashchange', () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id && byId.has(id) && id !== stack[active]) openNote(id);
});
