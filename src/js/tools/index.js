/**
 * Interactive widgets. Each note lists the tools that fill its `<div data-tool>`
 * slots, in order; a tool is a function that takes the slot element and owns it.
 */

import { grid, nickell, counter, chooser } from './structure.js';
import { diagnostics, code, walkthrough, implementations } from './practice.js';
import { cards, quiz, queue } from './drill.js';
import { monteCarlo, weakInstruments } from './lab.js';

export const TOOLS = {
  grid,
  nickell,
  counter,
  chooser,
  diag: diagnostics,
  code,
  walk: walkthrough,
  impl: implementations,
  cards,
  quiz,
  queue,
  mc: monteCarlo,
  weak: weakInstruments
};

/** Fill a freshly built pane's tool slots. Unknown names are reported, not silent. */
export function mountTools(pane, note) {
  const names = note.tools ?? [];
  const slots = [...pane.querySelectorAll('[data-tool]')];

  slots.forEach((slot, index) => {
    const name = names[index];
    const tool = TOOLS[name];
    if (!tool) {
      slot.innerHTML = `<div class="vd no">Missing tool <code>${name ?? '(none declared)'}</code>.</div>`;
      return;
    }
    tool(slot);
  });
}
