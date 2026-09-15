/**
 * Quick switcher. Plain text filters notes; a leading `>` filters commands.
 *
 * Focus is trapped while it is open and returned to whatever opened it, so
 * keyboard users do not get dropped at the top of the document on Escape.
 */

import { NOTES, escapeHtml } from '../graph.js';
import { openNote } from '../router.js';

export function createPalette({ overlay, input, list, commands }) {
  let hits = [];
  let cursor = 0;
  let lastFocused = null;

  function fill() {
    const raw = input.value.trim();
    const isCommand = raw.startsWith('>');
    const query = (isCommand ? raw.slice(1) : raw).trim().toLowerCase();

    if (isCommand) {
      hits = commands
        .filter((c) => !query || c.label.toLowerCase().includes(query))
        .map((command) => ({ command }));
      list.innerHTML = hits.length
        ? hits.map((hit, i) => `
            <li role="option" aria-selected="${i === 0}" class="${i === 0 ? 'cur' : ''}" data-hit="${i}">
              ${escapeHtml(hit.command.label)}<small class="cmd">command</small>
            </li>`).join('')
        : '<li class="empty">No such command</li>';
    } else {
      hits = NOTES
        .filter((note) => !query
          || `${note.title} ${note.folder} ${note.tags.join(' ')}`.toLowerCase().includes(query))
        .slice(0, 10)
        .map((note) => ({ note }));
      const hint = query ? '' : '<li class="empty">Type <code>&gt;</code> for commands</li>';
      list.innerHTML = (hits.length
        ? hits.map((hit, i) => `
            <li role="option" aria-selected="${i === 0}" class="${i === 0 ? 'cur' : ''}" data-hit="${i}">
              ${escapeHtml(hit.note.title)}<small>${escapeHtml(hit.note.folder)}</small>
            </li>`).join('')
        : '<li class="empty">Nothing matches</li>') + hint;
    }
    cursor = 0;
  }

  function move(delta) {
    if (!hits.length) return;
    cursor = (cursor + delta + hits.length) % hits.length;
    list.querySelectorAll('[data-hit]').forEach((li, i) => {
      li.classList.toggle('cur', i === cursor);
      li.setAttribute('aria-selected', String(i === cursor));
    });
    list.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  }

  function run(hit) {
    if (!hit) return;
    close();
    if (hit.command) hit.command.run();
    else openNote(hit.note.id);
  }

  function open() {
    lastFocused = document.activeElement;
    overlay.classList.add('show');
    overlay.removeAttribute('aria-hidden');
    input.value = '';
    fill();
    input.focus();
  }

  function close() {
    if (!isOpen()) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    if (lastFocused instanceof HTMLElement && lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
  }

  const isOpen = () => overlay.classList.contains('show');

  input.addEventListener('input', fill);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); run(hits[cursor]); }
    else if (event.key === 'Tab') { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
  });

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-hit]');
    if (item) run(hits[Number(item.dataset.hit)]);
  });

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  return { open, close, isOpen };
}
