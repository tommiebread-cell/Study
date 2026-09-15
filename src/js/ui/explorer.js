/**
 * The left file tree: folders, a filter box, and a read marker per note.
 */

import { NOTES, FOLDERS, escapeHtml } from '../graph.js';
import { currentId, subscribe } from '../router.js';
import { isRead, onSessionChange } from '../session.js';
import { icon } from '../icons.js';

export function createExplorer({ tree, filter }) {
  const collapsed = new Set();

  function matches(note, query) {
    if (!query) return true;
    return `${note.title} ${note.tags.join(' ')} ${note.folder}`.toLowerCase().includes(query);
  }

  function render() {
    const query = filter.value.trim().toLowerCase();
    const current = currentId();

    tree.innerHTML = FOLDERS.map((folder) => {
      const items = NOTES.filter((note) => note.folder === folder && matches(note, query));
      if (!items.length) return '';

      // A filter expands everything: hiding matches behind a collapsed folder
      // makes the box look broken.
      const open = query ? true : !collapsed.has(folder);

      const children = items.map((note) => `
        <button class="nt${note.id === current ? ' on' : ''}${isRead(note.id) ? ' rd' : ''}"
                data-open="${escapeHtml(note.id)}" aria-current="${note.id === current}">
          <span class="dot"></span>${escapeHtml(note.title)}
        </button>`).join('');

      return `
        <div class="fold${open ? '' : ' shut'}">
          <button class="fh" data-folder="${escapeHtml(folder)}" aria-expanded="${open}">
            <span class="cv" aria-hidden="true">${icon('chevron-down')}</span>${escapeHtml(folder)}
            <span class="count">${items.length}</span>
          </button>
          <div class="fkids">${children}</div>
        </div>`;
    }).join('') || '<p class="empty">Nothing matches that filter.</p>';
  }

  filter.addEventListener('input', render);

  tree.addEventListener('click', (event) => {
    const header = event.target.closest('[data-folder]');
    if (!header) return;
    const folder = header.dataset.folder;
    if (collapsed.has(folder)) collapsed.delete(folder);
    else collapsed.add(folder);
    render();
  });

  subscribe(render);
  onSessionChange(render);
  render();

  return { render, focusFilter: () => filter.focus() };
}
