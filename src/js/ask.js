/**
 * "Ask about this note" — the artifact runtime's `sample` capability.
 *
 * Only ever available when the vault is running as a published Artifact inside
 * a Claude viewer. Served anywhere else (the dev server, a local file, a plain
 * static host) `window.claude` is absent or `use()` resolves null, and the
 * affordance simply never appears. Nothing else in the vault depends on it.
 */

import { byId, plainText, escapeHtml } from './graph.js';

/** Enough of a note to answer from, well under the 64 KiB input cap. */
const NOTE_BUDGET = 6000;

let resolved = null;

/**
 * Resolve the capability once and cache the promise. `use()` answers later than
 * the first script run and can take ~10s to decide on null, so callers must
 * treat this as "eventually, maybe".
 */
export function sampler() {
  if (resolved) return resolved;
  resolved = (async () => {
    try {
      const runtime = globalThis.claude;
      if (!runtime || typeof runtime.use !== 'function') return null;
      return await runtime.use('sample');
    } catch {
      return null;
    }
  })();
  return resolved;
}

/** Viewer-facing copy per error code. Never shows the developer message. */
function copyFor(code) {
  switch (code) {
    case 'rate_limited':
      return 'That is too many questions at once. Give it a minute and ask again.';
    case 'session_expired':
      return 'Your Claude session expired. Sign in again, then ask once more.';
    case 'refused':
      return 'Claude declined to answer that one. Try asking it a different way.';
    case 'empty_completion':
      return 'No answer came back. Try a more specific question.';
    case 'prompt_too_large':
      return 'That question is too long to send. Shorten it.';
    default:
      return 'Something went wrong reaching Claude. Try again.';
  }
}

/** Codes that mean the feature is unusable for the rest of this page load. */
const PERMANENT = new Set([
  'not_granted', 'sampling_disabled', 'not_declared',
  'capability_disabled', 'capability_removed'
]);

function buildPrompt(note, question) {
  const body = plainText(note.id).slice(0, NOTE_BUDGET);
  return `You are helping someone study dynamic panel data econometrics — Nickell bias, \
Arellano–Bond difference GMM, Blundell–Bond system GMM, instrument proliferation and the \
specification tests that go with them. They are reading a note from their study vault and have \
a question about it.

Answer from the note where it is relevant, and from your own knowledge of econometrics where \
the note is silent. Be concise: a few sentences, or a short list where the answer really is a \
list. Plain prose — no markdown headings, no bold. Use the note's own notation (rho, mu_i, \
y_i,t-1). If the note is wrong or out of step with current practice, say so plainly. If you are \
not sure, say you are not sure rather than guessing.

--- NOTE: ${note.title} (${note.folder}) ---
${body}
--- END OF NOTE ---

QUESTION: ${question}`;
}

/**
 * Build the ask panel for one pane. Returns the element; the caller decides
 * where it goes and when it is shown.
 */
export function createAskPanel(noteId) {
  const note = byId.get(noteId);
  const panel = document.createElement('div');
  panel.className = 'ask-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <form class="ask-form">
      <label class="ask-label" for="ask-${escapeHtml(noteId)}">Ask about “${escapeHtml(note.title)}”</label>
      <textarea id="ask-${escapeHtml(noteId)}" class="ask-input" rows="2"
        placeholder="Why does AR(1) rejecting not matter here?"></textarea>
      <div class="ctl">
        <button type="submit" class="btn pri" data-ask>Ask Claude</button>
        <button type="button" class="btn" data-stop hidden>Stop</button>
        <span class="mini ask-note">Uses your own Claude account.</span>
      </div>
    </form>
    <div class="ask-answer" data-answer hidden></div>`;

  const form = panel.querySelector('.ask-form');
  const input = panel.querySelector('.ask-input');
  const askButton = panel.querySelector('[data-ask]');
  const stopButton = panel.querySelector('[data-stop]');
  const answer = panel.querySelector('[data-answer]');

  let controller = null;

  const setBusy = (busy) => {
    askButton.disabled = busy;
    askButton.textContent = busy ? 'Asking…' : 'Ask Claude';
    stopButton.hidden = !busy;
  };

  stopButton.onclick = () => controller?.abort();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      input.focus();
      return;
    }

    const sample = await sampler();
    if (!sample) {
      answer.hidden = false;
      answer.className = 'ask-answer vd no';
      answer.textContent = 'Asking Claude is not available in this view.';
      return;
    }

    // A fresh controller per call: an aborted signal stays aborted.
    controller = new AbortController();
    setBusy(true);
    answer.hidden = false;
    answer.className = 'ask-answer thinking';
    answer.textContent = 'Thinking…';

    try {
      const { text, truncated } = await sample(buildPrompt(note, question), {
        signal: controller.signal,
        onText: ({ text: soFar }) => {
          answer.className = 'ask-answer';
          answer.textContent = soFar;
        }
      });
      answer.className = 'ask-answer';
      answer.textContent = truncated ? `${text}\n\n(Cut short — ask for less at a time.)` : text;
    } catch (error) {
      const code = error?.code ?? 'upstream_error';
      if (code === 'cancelled') {
        // The reader stopped it; keep whatever had streamed, say nothing.
        answer.className = 'ask-answer';
        answer.textContent = error.text ?? '';
        answer.hidden = !answer.textContent;
      } else if (PERMANENT.has(code)) {
        // Not usable in this view at all — take the whole feature away.
        document.body.classList.remove('can-ask');
        panel.hidden = true;
      } else {
        answer.className = 'ask-answer vd no';
        answer.textContent = copyFor(code);
      }
    } finally {
      setBusy(false);
      controller = null;
    }
  });

  return panel;
}

/**
 * Light the feature up if and when the runtime grants it. Panes check the body
 * class, so panes built before and after this resolves behave the same.
 */
export function enableAskWhenAvailable() {
  sampler().then((sample) => {
    if (sample) document.body.classList.add('can-ask');
  });
}
