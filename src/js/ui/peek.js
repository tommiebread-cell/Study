/**
 * Hover preview for wikilinks. Pointer-only by design: on touch, tapping the
 * link is the faster answer, and a preview would just sit in the way.
 */

import { byId, plainText, escapeHtml } from '../graph.js';

const DELAY = 320;
const WIDTH = 300;
const PREVIEW_CHARS = 190;

export function createPeek(element) {
  let timer = null;

  function hide() {
    element.style.display = 'none';
  }

  function show(anchor) {
    const note = byId.get(anchor.dataset.open);
    if (!note) return;

    element.innerHTML = `<b>${escapeHtml(note.title)}</b>${escapeHtml(plainText(note.id).slice(0, PREVIEW_CHARS))}…`;
    element.style.display = 'block';

    const rect = anchor.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - WIDTH - 8))}px`;
    const below = rect.bottom + element.offsetHeight + 12 < innerHeight;
    element.style.top = `${below ? rect.bottom + 8 : rect.top - element.offsetHeight - 8}px`;
  }

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const anchor = event.target.closest?.('a.wl[data-open]');
    if (!anchor) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(anchor), DELAY);
  });

  document.addEventListener('pointerout', (event) => {
    if (!event.target.closest?.('a.wl[data-open]')) return;
    clearTimeout(timer);
    hide();
  });

  addEventListener('scroll', hide, { passive: true, capture: true });

  return { hide };
}
