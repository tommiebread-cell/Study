/** Small helpers shared by the tools. */

export const qs = (root) => (selector) => root.querySelector(selector);
export const qsa = (root) => (selector) => [...root.querySelectorAll(selector)];

/** Set a verdict box's tone and content in one call. */
export function verdict(element, tone, html) {
  element.className = `vd ${tone}`;
  element.innerHTML = html;
}

/** Wire a group of buttons as a single-choice toggle. */
export function choiceGroup(buttons, onPick) {
  for (const button of buttons) {
    button.onclick = () => {
      for (const other of buttons) other.classList.toggle('on', other === button);
      onPick(button);
    };
  }
}

export const fixed = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

export const signed = (value, digits = 3) =>
  (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}` : '—');

/**
 * Run `work` in slices that fit inside a frame, so a few hundred replications
 * never block the page. Resolves when done, or when `shouldStop` says so.
 */
export function chunked({ total, budgetMs = 55, step, onProgress, shouldStop, isAlive }) {
  return new Promise((resolve) => {
    let done = 0;
    const tick = () => {
      if (!isAlive() || shouldStop()) {
        resolve(done);
        return;
      }
      const started = performance.now();
      while (done < total && performance.now() - started < budgetMs && !shouldStop()) {
        step(done);
        done++;
      }
      onProgress(done);
      if (done < total && !shouldStop()) requestAnimationFrame(tick);
      else resolve(done);
    };
    requestAnimationFrame(tick);
  });
}
