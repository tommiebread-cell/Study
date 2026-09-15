/**
 * The pane stack, the tab strip, and the right sidebar.
 *
 * Panes are reconciled rather than rebuilt: a pane whose note has not changed
 * keeps its DOM, so a simulation running in one pane survives you opening a
 * link in another. That was the single worst thing about rebuilding the strip
 * from innerHTML on every navigation.
 */

import { byId, renderBody, backlinks, outgoing, escapeHtml } from '../graph.js';
import { openNote, closePane, focusPane, subscribe, activeIndex } from '../router.js';
import { isRead, toggleRead, onSessionChange } from '../session.js';
import { mathify } from '../mathify.js';
import { icon } from '../icons.js';
import { mountTools } from '../tools/index.js';
import { createAskPanel } from '../ask.js';
import { drawLocalGraph } from './graphview.js';

export function createPanes({ container, tabs, outline, localGraph, backlinksBox, outlinksBox }) {
  let headings = [];

  /** Callouts carry their kind in data-t; the icon comes from here, not the copy. */
  const CALLOUT_ICON = {
    warn: 'triangle-alert',
    dang: 'circle-x',
    succ: 'circle-check',
    quote: 'arrow-right'
  };

  function decorateCallouts(pane) {
    for (const callout of pane.querySelectorAll('.callout')) {
      const title = callout.querySelector('.ct');
      if (!title) continue;
      title.insertAdjacentHTML('afterbegin', icon(CALLOUT_ICON[callout.dataset.t] ?? 'arrow-right'));
    }
  }

  function paneMarkup(note, index, total) {
    const read = isRead(note.id);
    const tags = note.tags.map((tag) =>
      `<button class="tg" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('');
    const count = backlinks(note.id).length;
    // A note that opens with its own hero supplies the page's title itself;
    // stacking the pane's h1 above it gives the page two competing headings.
    const lede = note.tools?.[0] === 'hero'
      ? ''
      : `<h1>${escapeHtml(note.title)}</h1>
         <div class="meta">${tags}<span class="mini">${count} backlink${count === 1 ? '' : 's'}</span></div>`;

    return `
      <div class="ph">
        <span class="crumb">${escapeHtml(note.folder)} / ${escapeHtml(note.title)}</span>
        <button class="pb ask-toggle" data-ask-toggle aria-expanded="false"
                title="Ask Claude about this note">${icon('message-square')}Ask</button>
        <button class="pb${read ? ' rd' : ''}" data-read="${escapeHtml(note.id)}"
                aria-pressed="${read}">${icon(read ? 'circle-check' : 'circle')}Read</button>
        ${total > 1 ? `<button class="pb" data-close="${index}" title="Close pane"
                               aria-label="Close ${escapeHtml(note.title)}">${icon('x')}</button>` : ''}
      </div>
      <div class="pbody" tabindex="-1">
        ${lede}
        ${renderBody(note.body)}
      </div>`;
  }

  function buildPane(id, index, total) {
    const note = byId.get(id);
    const pane = document.createElement('article');
    pane.className = 'pane';
    pane.dataset.id = id;
    pane.dataset.index = String(index);
    pane.innerHTML = paneMarkup(note, index, total);

    mathify(pane);
    decorateCallouts(pane);
    mountTools(pane, note);

    const body = pane.querySelector('.pbody');

    // Only reachable once the runtime grants sampling; CSS hides the toggle
    // until then, so a pane built early behaves like one built late.
    const askPanel = createAskPanel(id);
    const meta = body.querySelector('.meta');
    if (meta) body.insertBefore(askPanel, meta.nextSibling);
    else body.insertBefore(askPanel, body.firstChild);
    pane.querySelector('[data-ask-toggle]').onclick = (event) => {
      askPanel.hidden = !askPanel.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!askPanel.hidden));
      if (!askPanel.hidden) askPanel.querySelector('.ask-input').focus();
    };

    body.addEventListener('scroll', () => {
      if (Number(pane.dataset.index) === activeIndex()) markCurrentHeading(pane);
    }, { passive: true });

    // Clicking or tabbing anywhere in a pane makes it the active one.
    pane.addEventListener('pointerdown', () => focusPane(Number(pane.dataset.index)));
    pane.addEventListener('focusin', () => focusPane(Number(pane.dataset.index)));

    return pane;
  }

  /** Update only what depends on index or read state, leaving tools alone. */
  function refreshHeader(pane, index, total) {
    const note = byId.get(pane.dataset.id);
    pane.dataset.index = String(index);

    const readButton = pane.querySelector('[data-read]');
    const read = isRead(note.id);
    readButton.classList.toggle('rd', read);
    readButton.setAttribute('aria-pressed', String(read));
    readButton.innerHTML = `${icon(read ? 'circle-check' : 'circle')}Read`;

    const closeButton = pane.querySelector('[data-close]');
    if (total > 1 && !closeButton) {
      pane.querySelector('.ph').insertAdjacentHTML('beforeend',
        `<button class="pb" data-close="${index}" title="Close pane"
                 aria-label="Close ${escapeHtml(note.title)}">${icon('x')}</button>`);
    } else if (total > 1) {
      closeButton.dataset.close = String(index);
    } else if (closeButton) {
      closeButton.remove();
    }
  }

  function renderPanes(stack) {
    // Reconcile by id and position, keeping panes that have not moved.
    for (let i = 0; i < stack.length; i++) {
      const existing = container.children[i];
      if (existing && existing.dataset.id === stack[i]) {
        refreshHeader(existing, i, stack.length);
        continue;
      }
      const pane = buildPane(stack[i], i, stack.length);
      if (existing) container.replaceChild(pane, existing);
      else container.appendChild(pane);
    }
    while (container.children.length > stack.length) container.lastElementChild.remove();
  }

  function renderTabs(stack, active) {
    tabs.innerHTML = stack.map((id, i) => {
      const note = byId.get(id);
      const closer = i === active && stack.length > 1
        ? `<span class="c" data-close="${i}" role="presentation">${icon('x')}</span>`
        : '';
      return `<button class="tb${i === active ? ' on' : ''}" data-tab="${i}"
                      aria-current="${i === active}">${escapeHtml(note.title)}${closer}</button>`;
    }).join('');
  }

  function renderLinkList(target, ids, emptyMessage) {
    target.innerHTML = ids.length
      ? ids.map((id) => {
        const note = byId.get(id);
        return `<button class="bl" data-open="${escapeHtml(id)}">${escapeHtml(note.title)}
                  <small>${escapeHtml(note.folder)}</small></button>`;
      }).join('')
      : `<p class="empty">${emptyMessage}</p>`;
  }

  function renderOutline(pane) {
    headings = pane ? [...pane.querySelectorAll('.pbody h2')] : [];
    outline.innerHTML = headings.length
      ? headings.map((h, i) => `<li><button data-heading="${i}">${escapeHtml(h.textContent)}</button></li>`).join('')
      : '<li><p class="empty">No headings.</p></li>';

    for (const button of outline.querySelectorAll('[data-heading]')) {
      button.onclick = () => headings[Number(button.dataset.heading)]
        .scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (pane) markCurrentHeading(pane);
  }

  function markCurrentHeading(pane) {
    if (!headings.length) return;
    const body = pane.querySelector('.pbody');
    const threshold = body.getBoundingClientRect().top + 70;
    let current = -1;
    headings.forEach((h, i) => { if (h.getBoundingClientRect().top <= threshold) current = i; });
    outline.querySelectorAll('[data-heading]').forEach((button, i) => {
      button.classList.toggle('cur', i === current);
    });
  }

  function renderSidebar(stack, active) {
    const id = stack[active];
    if (!id) return;
    renderLinkList(backlinksBox, backlinks(id), 'No notes link here yet.');
    renderLinkList(outlinksBox, outgoing(id), 'This note links nowhere.');
    renderOutline(container.children[active]);
    drawLocalGraph(localGraph, id);
  }

  function render({ stack, active, reason }) {
    renderPanes(stack);
    renderTabs(stack, active);
    renderSidebar(stack, active);
    document.body.classList.remove('nav');

    if (reason === 'open') {
      container.lastElementChild?.scrollIntoView({ inline: 'end', block: 'nearest' });
    }
  }

  subscribe(render);

  // Read state shows in the pane header; redraw the headers when it changes.
  onSessionChange(() => {
    for (let i = 0; i < container.children.length; i++) {
      refreshHeader(container.children[i], i, container.children.length);
    }
  });

  container.addEventListener('click', (event) => {
    const tagButton = event.target.closest('[data-tag]');
    if (tagButton) return; // handled globally, so tag panes open from any pane
    const readButton = event.target.closest('[data-read]');
    if (readButton) toggleRead(readButton.dataset.read);
  });

  tabs.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      event.stopPropagation();
      closePane(Number(closer.dataset.close));
      return;
    }
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    const index = Number(tab.dataset.tab);
    focusPane(index);
    container.children[index]?.scrollIntoView({ inline: 'start', block: 'nearest' });
  });

  addEventListener('resize', () => {
    const active = activeIndex();
    const id = container.children[active]?.dataset.id;
    if (id) drawLocalGraph(localGraph, id);
  });

  return {
    /** Re-derive the sidebar after a theme change, which repaints the canvas. */
    refresh: () => {
      const active = activeIndex();
      const id = container.children[active]?.dataset.id;
      if (id) drawLocalGraph(localGraph, id);
    },
    paneAt: (index) => container.children[index],
    openFromPane: (id, pane) => openNote(id, pane ? Number(pane.dataset.index) : undefined)
  };
}
