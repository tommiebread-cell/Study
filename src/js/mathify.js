/**
 * Typesetting for the maths runs.
 *
 * `.eq` and `.m` are italic serif by default, which is right for variables and
 * wrong for everything else. This walks their text and wraps the runs that must
 * stay upright: digits, operator names, Δ, and all-caps labels like FE or OLS.
 *
 * The observer only processes nodes it saw added, rather than rescanning the
 * whole pane, so a simulation redrawing its results every frame stays cheap.
 */

const UPRIGHT_WORDS = new Set([
  'plim', 'min', 'max', 'corr', 'sd', 'var', 'cov', 'rmse', 'df', 'E'
]);

const TOKEN = /[0-9]+(?:[.,][0-9]+)*|[A-Za-z]+|[Δχ∞]/g;
const SKIP_INSIDE = 'small,.up,code,pre,kbd';

function isUpright(token) {
  if (/^[0-9]/.test(token)) return true;
  if (/^[Δχ∞]$/.test(token)) return true;
  if (UPRIGHT_WORDS.has(token)) return true;
  return token.length > 1 && token === token.toUpperCase();
}

function typesetNode(node) {
  if (node.dataset.mf) return;
  node.dataset.mf = '1';

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP_INSIDE)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT)
  });

  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);

  for (const textNode of texts) {
    const str = textNode.nodeValue;
    if (!/[0-9A-Za-zΔχ∞]/.test(str)) continue;

    const frag = document.createDocumentFragment();
    let last = 0;
    let match;
    TOKEN.lastIndex = 0;

    while ((match = TOKEN.exec(str)) !== null) {
      if (!isUpright(match[0])) continue;
      if (match.index > last) frag.appendChild(document.createTextNode(str.slice(last, match.index)));
      const span = document.createElement('span');
      span.className = 'up';
      span.textContent = match[0];
      frag.appendChild(span);
      last = match.index + match[0].length;
    }

    if (!frag.childNodes.length) continue;
    if (last < str.length) frag.appendChild(document.createTextNode(str.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

/** Typeset every maths run inside `root` (and `root` itself if it is one). */
export function mathify(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches?.('.eq, .m')) typesetNode(root);
  for (const node of root.querySelectorAll('.eq, .m')) typesetNode(node);
}

/** Typeset anything added under `container` from now on. */
export function observe(container) {
  const pending = new Set();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    for (const node of pending) {
      if (node.isConnected) mathify(node);
    }
    pending.clear();
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) pending.add(node);
      }
    }
    if (pending.size && !scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}
