/**
 * Wiring. Everything here is composition: state lives in router.js and
 * session.js, rendering lives in ui/, and the maths lives in sim/.
 */

import { NOTES, byId, EDGES, escapeHtml, registerVirtual } from './graph.js';
import { openNote, start, closePane, closeOthers, currentId, activeIndex } from './router.js';
import { session, load as loadSession, markRead, clearRead, onSessionChange } from './session.js';
import { observe as observeMaths } from './mathify.js';
import { enableAskWhenAvailable } from './ask.js';
import { icon } from './icons.js';
import { createPanes } from './ui/panes.js';
import { createExplorer } from './ui/explorer.js';
import { createPalette } from './ui/palette.js';
import { createGraphView } from './ui/graphview.js';
import { createPeek } from './ui/peek.js';

const $ = (id) => document.getElementById(id);

const HOME = 'today';

/* ------------------------------------------------------------------ boot ---- */

loadSession();
enableAskWhenAvailable();

// The shell's icons live in one place; the markup only names them.
for (const host of document.querySelectorAll('[data-icon]')) {
  host.insertAdjacentHTML('afterbegin', icon(host.dataset.icon));
}

observeMaths($('panes'));

const panes = createPanes({
  container: $('panes'),
  tabs: $('tabs'),
  outline: $('outline'),
  localGraph: $('localGraph'),
  backlinksBox: $('backlinks'),
  outlinksBox: $('outlinks')
});

const explorer = createExplorer({ tree: $('tree'), filter: $('filter') });
const peek = createPeek($('peek'));

const graphView = createGraphView({
  overlay: $('graphOverlay'),
  canvas: $('graphCanvas'),
  legend: $('graphLegend'),
  closeButton: $('graphClose')
});

const palette = createPalette({
  overlay: $('paletteOverlay'),
  input: $('paletteInput'),
  list: $('paletteList'),
  commands: [
    { label: 'Run a new simulation', run: runSimulation },
    { label: 'Open graph view', run: () => graphView.open() },
    { label: 'Open a random note', run: () => openNote(NOTES[Math.floor(Math.random() * NOTES.length)].id) },
    { label: 'Go to Today', run: () => openNote(HOME) },
    { label: 'Open the reading order', run: () => openNote('start-here') },
    { label: 'Open review queue', run: () => openNote('review') },
    { label: 'Mark this note read', run: () => markRead(currentId()) },
    { label: 'Mark every note unread', run: clearRead },
    { label: 'Close all panes but this one', run: closeOthers },
    { label: 'Filter the note list', run: () => { document.body.classList.add('nav'); explorer.focusFilter(); } }
  ]
});

function runSimulation() {
  openNote('simulation');
  // The pane mounts synchronously, but let layout settle before the canvas sizes.
  requestAnimationFrame(() => {
    $('panes').querySelector('[data-run]')?.click();
  });
}

/* ------------------------------------------------------------ tag search ---- */

function openTagSearch(tag, fromIndex) {
  const hits = NOTES.filter((note) => note.tags.includes(tag));
  const id = registerVirtual({
    id: `tag:${tag}`,
    title: `#${tag}`,
    folder: 'Search',
    tags: [],
    body: `<p>${hits.length} note${hits.length === 1 ? '' : 's'} tagged <code>#${escapeHtml(tag)}</code>.</p>
      <ul>${hits.map((note) =>
    `<li>[[${note.id}|${note.title}]] — <span class="mini">${escapeHtml(note.folder)}</span></li>`).join('')}</ul>`
  });
  // Opens beside the note you clicked the tag in, like any other link, so the
  // trail you were following stays on screen.
  openNote(id, fromIndex);
}

/* -------------------------------------------------------- global actions ---- */

document.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close]');
  if (closer && closer.closest('#tabs, .pane')) {
    event.stopPropagation();
    closePane(Number(closer.dataset.close));
    return;
  }

  const link = event.target.closest('[data-open]');
  if (link) {
    // Wikilinks carry a real href so they are focusable and copyable; the
    // router does the navigation, so stop the browser following it.
    event.preventDefault();
    const pane = link.closest('.pane');
    openNote(link.dataset.open, pane ? Number(pane.dataset.index) : undefined);
    peek.hide();
    return;
  }

  const tag = event.target.closest('[data-tag]');
  if (tag) {
    const pane = tag.closest('.pane');
    openTagSearch(tag.dataset.tag, pane ? Number(pane.dataset.index) : undefined);
  }
});

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;

  if (mod && (key === 'p' || key === 'o')) {
    event.preventDefault();
    palette.open();
  } else if (mod && key === 'g') {
    event.preventDefault();
    graphView.toggle();
  } else if (mod && key === 'k') {
    event.preventDefault();
    document.body.classList.add('nav');
    explorer.focusFilter();
  } else if (event.key === 'Escape') {
    palette.close();
    graphView.close();
    document.body.classList.remove('nav');
  } else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    // Alt+arrows walk the open panes without reaching for the mouse.
    event.preventDefault();
    const next = activeIndex() + (event.key === 'ArrowRight' ? 1 : -1);
    const pane = panes.paneAt(next);
    if (pane) {
      pane.querySelector('.pbody').focus();
      pane.scrollIntoView({ inline: 'start', block: 'nearest' });
    }
  }
});

$('ribbonNav').onclick = () => document.body.classList.toggle('nav');
$('navClose').onclick = () => document.body.classList.remove('nav');
$('ribbonPalette').onclick = () => palette.open();
$('statusPalette').onclick = () => palette.open();
$('ribbonGraph').onclick = () => graphView.open();
$('ribbonHome').onclick = () => openNote(HOME);
$('sidebarToggle').onclick = () => document.body.classList.toggle('aside');

/* ----------------------------------------------------------- status bar ---- */

function renderStatus() {
  $('statusRead').textContent = `${session.read.size}/${NOTES.length} read`;

  const answers = Object.values(session.quiz);
  const bits = [];
  if (answers.length) bits.push(`${answers.filter((a) => a.ok).length}/${answers.length} quiz`);
  if (session.cards.size) bits.push(`${session.cards.size} card${session.cards.size === 1 ? '' : 's'} flagged`);
  if (session.runs.length) bits.push(`${session.runs.length} simulation${session.runs.length === 1 ? '' : 's'}`);
  $('statusSession').textContent = bits.join(' · ');
}

$('statusNotes').textContent = `${NOTES.length} notes · ${EDGES.length} links`;
onSessionChange(renderStatus);
renderStatus();

/* ------------------------------------------------------------------ go! ---- */

start(byId.has(HOME) ? HOME : NOTES[0].id);
