/**
 * Two graphs: the small local one in the sidebar, and the full force-directed
 * view behind the ribbon button.
 *
 * The simulation cools and then stops, rather than spinning at 60fps forever;
 * dragging or toggling a filter reheats it.
 */

import { NOTES, byId, EDGES, FOLDERS, outgoing, backlinks, escapeHtml } from '../graph.js';
import { openNote, currentId } from '../router.js';
import { cssVar, prepareCanvas } from '../plots.js';

export const FOLDER_COLOR = {
  Daily: '--ink',
  Setup: '--slate',
  Estimators: '--sage',
  Practice: '--ochre',
  Review: '--moss',
  Literature: '--ink-4'
};

const colorFor = (folder) => cssVar(FOLDER_COLOR[folder] || '--ink-3');

/* ---------------------------------------------------------------- local ---- */

export function drawLocalGraph(canvas, id) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height } = prepared;

  const neighbours = [...new Set([...outgoing(id), ...backlinks(id)])].slice(0, 9);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 24;
  const hits = [];

  neighbours.forEach((target, index) => {
    const angle = (index / neighbours.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = colorFor(byId.get(target).folder);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cssVar('--ink-3');
    ctx.font = '9.5px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(byId.get(target).title.slice(0, 15), x, y - 8);
    hits.push({ x, y, id: target });
  });

  ctx.fillStyle = cssVar('--sage');
  ctx.beginPath();
  ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // The centre label sits among the neighbour labels, so give it a paper
  // backing rather than letting two names overprint each other.
  const centreLabel = (byId.get(id)?.title ?? id).slice(0, 18);
  ctx.font = '600 10.5px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const labelWidth = ctx.measureText(centreLabel).width;
  ctx.fillStyle = cssVar('--paper-2');
  ctx.fillRect(cx - labelWidth / 2 - 4, cy + 10, labelWidth + 8, 14);
  ctx.fillStyle = cssVar('--ink');
  ctx.fillText(centreLabel, cx, cy + 20);

  if (!neighbours.length) {
    ctx.fillStyle = cssVar('--ink-4');
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.fillText('no links', cx, cy + 34);
  }

  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const hit = hits.find((h) => Math.hypot(h.x - mx, h.y - my) < 14);
    if (hit) openNote(hit.id);
  };
}

/* ----------------------------------------------------------------- full ---- */

const REPULSION = 2600;
const SPRING_LENGTH = 108;
const SPRING = 0.012;
const CENTERING = 0.0016;
const DAMPING = 0.82;
const COOLING = 0.992;
const SLEEP_BELOW = 0.02;

export function createGraphView({ overlay, canvas, legend, closeButton }) {
  let nodes = [];
  let running = false;
  let alpha = 1;
  let hovered = null;
  let drag = null;
  let pressedAt = null;
  let focusMode = false;
  const hiddenFolders = new Set();

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const isVisible = (node) => {
    if (hiddenFolders.has(node.folder)) return false;
    if (!focusMode) return true;
    const current = currentId();
    return node.id === current
      || outgoing(current).includes(node.id)
      || backlinks(current).includes(node.id);
  };

  function seed() {
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;
    nodes = NOTES.map((note, i) => {
      const angle = (i / NOTES.length) * Math.PI * 2;
      return {
        id: note.id,
        folder: note.folder,
        title: note.title,
        degree: outgoing(note.id).length + backlinks(note.id).length,
        x: width / 2 + Math.cos(angle) * (width / 3.4),
        y: height / 2 + Math.sin(angle) * (height / 3.4),
        vx: 0,
        vy: 0
      };
    });
    alpha = 1;
  }

  function step() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const index = new Map(nodes.map((n) => [n.id, n]));

    for (let a = 0; a < nodes.length; a++) {
      const p = nodes[a];
      if (!isVisible(p)) continue;
      for (let b = a + 1; b < nodes.length; b++) {
        const q = nodes[b];
        if (!isVisible(q)) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const force = REPULSION / d2;
        const ux = dx / d;
        const uy = dy / d;
        p.vx -= ux * force; p.vy -= uy * force;
        q.vx += ux * force; q.vy += uy * force;
      }
    }

    for (const [a, b] of EDGES) {
      const p = index.get(a);
      const q = index.get(b);
      if (!p || !q || !isVisible(p) || !isVisible(q)) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const force = (d - SPRING_LENGTH) * SPRING;
      const ux = dx / d;
      const uy = dy / d;
      p.vx += ux * force; p.vy += uy * force;
      q.vx -= ux * force; q.vy -= uy * force;
    }

    let motion = 0;
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      if (drag && drag.node === node) {
        node.x = drag.x;
        node.y = drag.y;
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += (width / 2 - node.x) * CENTERING;
      node.vy += (height / 2 - node.y) * CENTERING;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x = Math.max(28, Math.min(width - 28, node.x + node.vx * alpha));
      node.y = Math.max(24, Math.min(height - 24, node.y + node.vy * alpha));
      motion += Math.abs(node.vx) + Math.abs(node.vy);
    }

    alpha *= COOLING;
    return motion * alpha;
  }

  function draw() {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx } = prepared;

    const index = new Map(nodes.map((n) => [n.id, n]));
    const near = new Set();
    if (hovered) {
      near.add(hovered.id);
      for (const id of outgoing(hovered.id)) near.add(id);
      for (const id of backlinks(hovered.id)) near.add(id);
    }

    for (const [a, b] of EDGES) {
      const p = index.get(a);
      const q = index.get(b);
      if (!p || !q || !isVisible(p) || !isVisible(q)) continue;
      const hot = hovered && near.has(a) && near.has(b);
      ctx.strokeStyle = hot ? cssVar('--sage-deep') : cssVar('--rule');
      ctx.lineWidth = hot ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    const current = currentId();
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const r = 5 + Math.min(node.degree, 8) * 0.9;
      const dimmed = hovered && !near.has(node.id);

      ctx.globalAlpha = dimmed ? 0.3 : 1;
      ctx.fillStyle = colorFor(node.folder);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (node.id === current) {
        ctx.strokeStyle = cssVar('--ink');
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = cssVar(dimmed ? '--ink-4' : '--ink-3');
      const bold = node.id === current || (hovered && node.id === hovered.id);
      ctx.font = `${bold ? '600 ' : ''}11px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.title, node.x, node.y - r - 5);
      ctx.globalAlpha = 1;
    }
  }

  function loop() {
    if (!running) return;
    const motion = step();
    draw();
    // Settle instead of burning a core forever; interaction reheats it.
    if (motion < SLEEP_BELOW && !drag) return;
    requestAnimationFrame(loop);
  }

  function reheat(amount = 0.6) {
    alpha = Math.max(alpha, amount);
    if (running) requestAnimationFrame(loop);
  }

  function renderLegend() {
    legend.innerHTML = FOLDERS.map((folder) => `
      <button class="lgb${hiddenFolders.has(folder) ? ' off' : ''}" data-folder="${escapeHtml(folder)}"
              aria-pressed="${!hiddenFolders.has(folder)}">
        <i class="swatch round" style="background:${colorFor(folder)}"></i>${escapeHtml(folder)}
      </button>`).join('')
      + `<button class="lgb framed${focusMode ? ' on' : ''}" data-focus aria-pressed="${focusMode}">
           ${focusMode ? 'neighbours only' : 'focus current note'}
         </button>`;

    for (const button of legend.querySelectorAll('[data-folder]')) {
      button.onclick = () => {
        const folder = button.dataset.folder;
        if (hiddenFolders.has(folder)) hiddenFolders.delete(folder);
        else hiddenFolders.add(folder);
        renderLegend();
        reheat();
      };
    }
    legend.querySelector('[data-focus]').onclick = () => {
      focusMode = !focusMode;
      renderLegend();
      reheat();
    };
  }

  const pointerPosition = (event) => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] ?? event;
    return [source.clientX - rect.left, source.clientY - rect.top];
  };

  const pick = (x, y) => nodes.find((n) => isVisible(n) && Math.hypot(n.x - x, n.y - y) < 16);

  canvas.addEventListener('pointermove', (event) => {
    const [x, y] = pointerPosition(event);
    if (drag) {
      drag.x = x;
      drag.y = y;
      reheat(0.4);
      return;
    }
    const next = pick(x, y);
    if (next !== hovered) {
      hovered = next;
      draw();
    }
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  });

  canvas.addEventListener('pointerdown', (event) => {
    const [x, y] = pointerPosition(event);
    const node = pick(x, y);
    pressedAt = [x, y];
    if (!node) return;
    drag = { node, x, y };
    canvas.setPointerCapture?.(event.pointerId);
    reheat(0.4);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (drag && pressedAt) {
      const [x, y] = pointerPosition(event);
      // A press that did not move is a click, not a drag.
      if (Math.hypot(x - pressedAt[0], y - pressedAt[1]) < 5) {
        const target = drag.node.id;
        close();
        openNote(target);
      }
    }
    drag = null;
    pressedAt = null;
  });

  canvas.addEventListener('pointercancel', () => { drag = null; pressedAt = null; });

  function open() {
    overlay.classList.add('show');
    overlay.removeAttribute('aria-hidden');
    renderLegend();
    requestAnimationFrame(() => {
      seed();
      running = true;
      if (reducedMotion.matches) {
        // Lay it out without animating, then paint once.
        for (let i = 0; i < 260; i++) step();
        draw();
        running = false;
      } else {
        loop();
      }
    });
    closeButton.focus();
  }

  function close() {
    running = false;
    drag = null;
    hovered = null;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }

  const isOpen = () => overlay.classList.contains('show');

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  addEventListener('resize', () => { if (isOpen()) { reheat(0.3); draw(); } });

  return { open, close, isOpen, toggle: () => (isOpen() ? close() : open()) };
}
