/**
 * Review tools: flashcards with a working queue, the quiz, and the review note
 * that fills itself from both plus the simulation lab.
 */

import { byId, escapeHtml } from '../graph.js';
import {
  session, recordAnswer, flagCard, unflagCard, clearProgress, onSessionChange
} from '../session.js';
import { qs } from './dom.js';

/* ------------------------------------------------------------ flashcards ---- */

const CARDS = [
  ['Moment condition, differenced equation',
    'E[ y<sub>i,t−s</sub> Δu<sub>it</sub> ] = 0 for s = 2, …, t−1. Lagged <i>levels</i> instrument the differences.'],
  ['Moment condition, level equation',
    'E[ Δy<sub>i,t−1</sub> u<sub>it</sub> ] = 0. Lagged <i>differences</i> instrument the levels, under mean stationarity.'],
  ['Order of the Nickell bias',
    'O(1/T), negative for ρ. A short-panel problem that disappears as T grows.'],
  ['When are lagged levels weak?',
    'As ρ approaches 1. A near-random-walk level barely predicts its own change, so the differenced equation loses identification.'],
  ['What does collapsing do?',
    'Sums each moment condition across periods: one column per lag order instead of one per period per lag. Identification survives, redundancy goes.'],
  ['One-step versus two-step',
    'One-step uses a fixed weight matrix built from the MA(1) structure of Δu. Two-step estimates it from first-step residuals — efficient, but the errors need Windmeijer.'],
  ['Sargan versus Hansen',
    'Same null of instrument exogeneity. Sargan assumes homoskedasticity; Hansen J is robust and is the one to quote from a robust two-step run.'],
  ['Why does AR(1) reject?',
    'Differencing makes Δu<sub>it</sub> and Δu<sub>i,t−1</sub> share u<sub>i,t−1</sub>, so Δu is MA(1) by construction.'],
  ['What does a Hansen p of 0.99 mean?',
    'Almost always too many instruments rather than perfect ones — a test with no power left.'],
  ['The sanity bracket',
    'ρ̂<sub>FE</sub> &lt; ρ̂<sub>GMM</sub> &lt; ρ̂<sub>OLS</sub>. FE biased down, pooled OLS up. Holds in nearly every draw at moderate ρ, and well under half the time at ρ = 0.95.']
];

export function cards(slot) {
  let queue = CARDS.map((_, i) => i);
  let position = 0;
  let revealed = false;
  let reviewed = 0;

  slot.innerHTML = `
    <div class="tool">
      <p class="hint" data-count></p>
      <div class="card" data-card tabindex="0" role="button"
           aria-label="Flashcard, activate to reveal the answer"></div>
      <div class="ctl">
        <button class="btn" data-known>Got it</button>
        <button class="btn" data-again>Review again</button>
        <button class="btn" data-skip>Skip</button>
        <button class="btn" data-shuffle>Shuffle</button>
      </div>
      <div class="vd nu" data-say></div>
    </div>`;

  const $ = qs(slot);

  function render() {
    if (!queue.length) {
      $('[data-card]').innerHTML = `
        <div class="q">Queue clear.</div>
        <div class="a">You worked through every card. Shuffle to start again, or take the
          <a class="wl" href="#quiz" data-open="quiz">quiz</a>.</div>`;
      $('[data-count]').textContent = 'No cards left in the queue';
      $('[data-say]').className = 'vd ok';
      $('[data-say]').innerHTML = `${reviewed} card${reviewed === 1 ? '' : 's'} reviewed`
        + (session.cards.size
          ? `, ${session.cards.size} flagged for the <a class="wl" href="#review" data-open="review">review queue</a>.`
          : '.');
      return;
    }

    position %= queue.length;
    const [prompt, answer] = CARDS[queue[position]];
    $('[data-card]').innerHTML = `
      <div class="q">${prompt}</div>
      ${revealed ? `<div class="a">${answer}</div>` : ''}
      <div class="fl">${revealed ? 'click to hide' : 'click to reveal'}</div>`;
    $('[data-count]').textContent =
      `${queue.length} card${queue.length === 1 ? '' : 's'} in the queue · ${reviewed} reviewed`;

    $('[data-say]').className = 'vd nu';
    $('[data-say]').innerHTML = session.cards.size
      ? `${session.cards.size} flagged for the <a class="wl" href="#review" data-open="review">review queue</a>.`
      : 'Mark a card either way and it leaves the queue, or comes back flagged for review.';
  }

  const flip = () => { revealed = !revealed; render(); };

  $('[data-card]').onclick = flip;
  $('[data-card]').onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flip();
    }
  };

  $('[data-known]').onclick = () => {
    if (!queue.length) return;
    unflagCard(CARDS[queue[position]][0]);
    queue.splice(position, 1);
    revealed = false;
    reviewed++;
    render();
  };

  $('[data-again]').onclick = () => {
    if (!queue.length) return;
    flagCard(CARDS[queue[position]][0]);
    queue.push(queue.splice(position, 1)[0]);
    revealed = false;
    reviewed++;
    render();
  };

  $('[data-skip]').onclick = () => {
    if (!queue.length) return;
    position = (position + 1) % queue.length;
    revealed = false;
    render();
  };

  $('[data-shuffle]').onclick = () => {
    queue = CARDS.map((_, i) => i);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    position = 0;
    revealed = false;
    render();
  };

  render();
}

/* ------------------------------------------------------------------ quiz ---- */

const QUESTIONS = [
  ['Why is the fixed-effects estimator biased in a dynamic panel?',
    ['The fixed effects correlate with the regressors',
      'The within transformation leaves y<sub>i,t−1</sub> correlated with the transformed error',
      'The errors are heteroskedastic', 'T exceeds N'], 1,
    'Demeaning subtracts an average containing u<sub>it</sub>, so the transformed lag and error move together. The bias is O(1/T) and negative.',
    'nickell-bias'],
  ['First-differencing achieves what, and at what cost?',
    ['Removes μ<sub>i</sub>, costs one period and makes Δu MA(1)', 'Removes serial correlation, costs nothing',
      'Removes heteroskedasticity, costs the time dummies', 'Removes the lagged dependent variable'], 0,
    'μ<sub>i</sub> is differenced away; t = 1 becomes unusable and Δu overlaps its own lag — which is why AR(1) rejects.',
    'difference-gmm'],
  ['With u serially uncorrelated, which levels are valid instruments in the differenced equation?',
    ['y<sub>i,t−1</sub> and deeper', 'y<sub>i,t−2</sub> and deeper', 'Only y<sub>i,1</sub>', 'Any lead or lag'], 1,
    'y<sub>i,t−1</sub> contains u<sub>i,t−1</sub>, which sits inside Δu<sub>it</sub>. Lag 2 is the first one clear.',
    'moment-conditions'],
  ['In System GMM, what instruments the level equation?',
    ['Deeper lagged levels', 'Lagged differences of y', 'External instruments', 'Time dummies'], 1,
    'E[Δy<sub>i,t−1</sub> u<sub>it</sub>] = 0. Levels instrument differences in one block, differences instrument levels in the other.',
    'system-gmm'],
  ['AR(2) returns p = 0.02. What follows?',
    ['Fine, AR(2) is expected to reject', 'Lag-2 instruments are invalid; go deeper or respecify',
      'Switch from Hansen to Sargan', 'Add instruments to fix the power problem'], 1,
    'AR(2) rejection means u is serially correlated, so the lag-2 moment fails. Start at lag 3, or add a lag of y.',
    'ar-tests'],
  ['Hansen J returns p = 0.98 with 140 instruments and N = 90.',
    ['Excellent instruments, report it', 'The test has lost power because the count outgrew the sample',
      'Proof of mean stationarity', 'Evidence of homoskedasticity'], 1,
    'A p-value that high with a count above N means a test that cannot detect a violation. Collapse and re-run.',
    'instruments'],
  ['What does System GMM require beyond Difference GMM?',
    ['Homoskedastic errors', 'Strict exogeneity of all regressors',
      'Mean stationarity of the initial conditions', 'Large T'], 2,
    'The deviation of y<sub>i1</sub> from its long-run mean must be uncorrelated with μ<sub>i</sub>. Test it with difference-in-Hansen.',
    'system-gmm'],
  ['What does the Windmeijer correction fix?',
    ['Downward-biased two-step standard errors in finite samples', 'Bias in the coefficient itself',
      'Serial correlation in u', 'Too many instruments'], 0,
    'Two-step is efficient but its standard errors are understated. The correction adjusts the covariance matrix; in Stata it arrives with robust.',
    'windmeijer'],
  ['At ρ = 0.9 with T = 6, what does the simulation show Difference GMM doing?',
    ['Landing on ρ with a tight spread', 'Sliding well below ρ with a very wide spread',
      'Matching pooled OLS', 'Becoming identical to System GMM'], 1,
    'Lagged levels stop predicting differences, so the estimator loses its identifying information: big downward bias, enormous variance. Run it yourself in the lab.',
    'simulation'],
  ['Pooled OLS gives 0.91, FE gives 0.24, your GMM estimate is 0.18. Read it.',
    ['Fine, GMM is meant to be lower', 'Outside the bracket — suspect weak instruments in the differenced block',
      'Proof the fixed effects are irrelevant', 'Evidence of too few instruments in the level equation'], 1,
    'ρ̂ should sit between FE and pooled OLS. Below FE usually means the differenced moments are carrying almost no information.',
    'cheat-sheet']
];

export function quiz(slot) {
  let order = QUESTIONS.map((_, i) => i);
  let position = 0;
  let selected = null;
  let checked = false;

  slot.innerHTML = `
    <div class="tool">
      <div data-question></div>
      <div class="ctl">
        <button class="btn pri" data-check>Check answer</button>
        <button class="btn" data-next>Next question</button>
        <button class="btn" data-shuffle>Shuffle</button>
        <span class="hint inline" data-score></span>
      </div>
      <p class="err" data-error role="alert">Choose an answer first.</p>
    </div>`;

  const $ = qs(slot);

  function render() {
    const [stem, options, correct, why, note] = QUESTIONS[order[position]];
    const target = byId.get(note);

    $('[data-question]').innerHTML = `
      <div class="qz${checked ? ' done' : ''}">
        <p class="stem">${position + 1}. ${stem}</p>
        ${options.map((option, i) => `<button class="opt" data-option="${i}">${option}</button>`).join('')}
        <p class="why">${why}
          <a class="wl" href="#${escapeHtml(note)}" data-open="${escapeHtml(note)}">Open ${escapeHtml(target ? target.title : note)}</a>
        </p>
      </div>`;

    for (const button of $('[data-question]').querySelectorAll('[data-option]')) {
      const index = Number(button.dataset.option);
      if (checked) {
        if (index === correct) button.classList.add('right');
        else if (index === selected) button.classList.add('wrong');
        button.disabled = true;
      } else if (index === selected) {
        button.classList.add('sel');
      }
      button.onclick = () => {
        if (checked) return;
        selected = index;
        $('[data-error]').style.display = 'none';
        render();
      };
    }

    const answered = Object.keys(session.quiz).length;
    const right = Object.values(session.quiz).filter((entry) => entry.ok).length;
    $('[data-score]').textContent = answered
      ? `${right} correct of ${answered} answered`
      : `${QUESTIONS.length} questions`;
  }

  $('[data-check]').onclick = () => {
    if (checked) return;
    if (selected === null) {
      $('[data-error]').style.display = 'block';
      return;
    }
    $('[data-error]').style.display = 'none';
    checked = true;

    const index = order[position];
    const [stem, , correct, , note] = QUESTIONS[index];
    recordAnswer(index, { ok: selected === correct, stem, note });
    render();
  };

  $('[data-next]').onclick = () => {
    position = (position + 1) % QUESTIONS.length;
    selected = null;
    checked = false;
    $('[data-error]').style.display = 'none';
    render();
  };

  $('[data-shuffle]').onclick = () => {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    position = 0;
    selected = null;
    checked = false;
    render();
  };

  render();
}

/* ----------------------------------------------------------------- queue ---- */

export function queue(slot) {
  function render() {
    const answered = Object.entries(session.quiz);
    const missed = answered.filter(([, entry]) => !entry.ok);
    const flagged = [...session.cards];
    const runs = session.runs;

    let html = '';

    if (!answered.length && !flagged.length && !runs.length) {
      html = `<div class="vd nu"><b>Nothing queued yet.</b> Answer something in the
        <a class="wl" href="#quiz" data-open="quiz">quiz</a>, flag a card in
        <a class="wl" href="#flashcards" data-open="flashcards">flashcards</a>, or run the
        <a class="wl" href="#simulation" data-open="simulation">simulation lab</a>, and this note
        will fill itself.</div>`;
    } else {
      if (answered.length) {
        const right = answered.filter(([, entry]) => entry.ok).length;
        html += `<h2>Quiz</h2><p>${right} right of ${answered.length} answered.</p>`;
        html += missed.length
          ? `<ul>${missed.map(([, entry]) => {
            const note = byId.get(entry.note);
            return `<li>${entry.stem} — reread
              <a class="wl" href="#${escapeHtml(entry.note)}" data-open="${escapeHtml(entry.note)}">${escapeHtml(note ? note.title : entry.note)}</a></li>`;
          }).join('')}</ul>`
          : '<div class="vd ok">Nothing missed so far.</div>';
      }

      if (flagged.length) {
        html += `<h2>Cards you flagged</h2><ul>${flagged.map((c) => `<li>${c}</li>`).join('')}</ul>`;
      }

      if (runs.length) {
        html += `<h2>Simulations run</h2>
          <table class="t num">
            <tr><th>setup</th><th>diff GMM</th><th>system GMM</th><th>bracket</th></tr>
            ${runs.slice(-6).reverse().map((run) => `
              <tr>
                <td>N=${run.n}, T=${run.t}, ρ=${run.rho.toFixed(2)}</td>
                <td>${run.diff.mean.toFixed(2)} ± ${run.diff.sd.toFixed(2)}</td>
                <td>${run.sys.mean.toFixed(2)} ± ${run.sys.sd.toFixed(2)}</td>
                <td>${run.bracket}%</td>
              </tr>`).join('')}
          </table>`;
      }
    }

    slot.innerHTML = `${html}
      <div class="ctl"><button class="btn" data-clear>Clear saved progress</button></div>`;

    slot.querySelector('[data-clear]').onclick = clearProgress;
  }

  // The queue is a view of the session, so it redraws whenever the session moves.
  onSessionChange(() => { if (slot.isConnected) render(); });
  render();
}
