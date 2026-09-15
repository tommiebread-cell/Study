/**
 * Tools for the practical notes: the diagnostics reader, the five-language code
 * browser, the worked pass, and the cross-language implementation check.
 */

import { SNIPPETS } from '../snippets.generated.js';
import { escapeHtml } from '../graph.js';
import { Rng } from '../sim/rng.js';
import { drawPanel, pooledOls, withinFe, differenceGmm, systemGmm } from '../sim/gmm.js';
import { qs, verdict } from './dom.js';

/* ---------------------------------------------------------- diagnostics ---- */

export function diagnostics(slot) {
  slot.innerHTML = `
    <div class="tool">
      <h3>Read your output</h3>
      <p class="hint">Enter the p-values your software printed. Instrument count and N are
        optional and sharpen the Hansen reading.</p>
      <div class="row">
        <div class="fld"><label for="dg-ar2">AR(2) p</label>
          <input id="dg-ar2" type="number" data-ar2 min="0" max="1" step="0.001" placeholder="0.30"></div>
        <div class="fld"><label for="dg-h">Hansen J p</label>
          <input id="dg-h" type="number" data-hansen min="0" max="1" step="0.001" placeholder="0.45"></div>
        <div class="fld"><label for="dg-iv">Instruments</label>
          <input id="dg-iv" type="number" data-instruments min="1" step="1" placeholder="34"></div>
        <div class="fld"><label for="dg-n">N</label>
          <input id="dg-n" type="number" data-n min="2" step="1" placeholder="100"></div>
      </div>
      <p class="err" data-error role="alert">Enter AR(2) and Hansen as p-values between 0 and 1.</p>
      <div class="ctl"><button class="btn pri" data-go>Interpret</button></div>
      <div data-out></div>
    </div>`;

  const $ = qs(slot);
  const error = $('[data-error]');

  for (const input of slot.querySelectorAll('input')) {
    input.oninput = () => { error.style.display = 'none'; };
  }

  $('[data-go]').onclick = () => {
    const ar2 = Number.parseFloat($('[data-ar2]').value);
    const hansen = Number.parseFloat($('[data-hansen]').value);
    const instruments = Number.parseFloat($('[data-instruments]').value);
    const n = Number.parseFloat($('[data-n]').value);
    const out = $('[data-out]');

    const valid = (p) => Number.isFinite(p) && p >= 0 && p <= 1;
    if (!valid(ar2) || !valid(hansen)) {
      error.style.display = 'block';
      out.innerHTML = '';
      return;
    }
    error.style.display = 'none';

    const findings = [['ok', 'AR(1) — nothing to check.',
      'Δu is MA(1) by construction, so rejection is the expected reading.']];

    if (ar2 < 0.05) {
      findings.push(['no', `AR(2) p = ${ar2.toFixed(3)} rejects.`,
        `u<sub>it</sub> is serially correlated, so y<sub>i,t−2</sub> is not a valid instrument.
         Start the window at lag 3, or add a lag of y to the model.`]);
    } else if (ar2 < 0.10) {
      findings.push(['hm', `AR(2) p = ${ar2.toFixed(3)} is borderline.`,
        'It survives at 5% but not comfortably. Show the result holds with instruments from lag 3.']);
    } else {
      findings.push(['ok', `AR(2) p = ${ar2.toFixed(3)} passes.`,
        'No second-order correlation in Δu, which licenses lag 2 onward.']);
    }

    if (hansen < 0.05) {
      findings.push(['no', `Hansen p = ${hansen.toFixed(3)} rejects.`,
        `The overidentifying restrictions fail as a set. Drop the suspect block, shorten the
         window, and check difference-in-Hansen if this is System GMM.`]);
    } else if (hansen > 0.9) {
      findings.push(['hm', `Hansen p = ${hansen.toFixed(3)} is implausibly clean.`,
        `Usually the instrument count has outgrown the sample and the test can no longer detect
         a violation. Collapse and re-run.`]);
    } else if (hansen > 0.25) {
      findings.push(['ok', `Hansen p = ${hansen.toFixed(3)} passes.`,
        'Above 0.05 and short of the range where the test stops meaning anything.']);
    } else {
      findings.push(['hm', `Hansen p = ${hansen.toFixed(3)} passes, barely.`,
        'You keep the instruments, but say which block is doing the damage.']);
    }

    if (Number.isFinite(instruments) && Number.isFinite(n) && instruments > 0 && n > 0) {
      if (instruments > n) {
        findings.push(['no', `${instruments} instruments against ${n} units.`,
          'Whatever the Hansen p-value says, this is the first thing a referee will circle.']);
      } else if (instruments / n > 0.5) {
        findings.push(['hm', `${instruments} instruments against ${n} units.`,
          `That is ${(instruments / n).toFixed(2)} columns per unit. Show the estimate survives collapsing.`]);
      } else {
        findings.push(['ok', `${instruments} instruments against ${n} units.`,
          'A count the Hansen test can actually police.']);
      }
    }

    findings.push(['nu', 'Last check, outside the tests.',
      `ρ̂ should sit between FE below and pooled OLS above. Outside that bracket, something is
       wrong regardless of p-values.`]);

    out.innerHTML = findings
      .map(([tone, title, body]) => `<div class="vd ${tone}"><b>${title}</b><br>${body}</div>`)
      .join('');
  };
}

/* ----------------------------------------------------------------- code ---- */

const ANNOTATIONS = {
  stata: [
    ['gmm(L.y, lag(2 4) collapse)', `Declares the lagged dependent variable as internally
      instrumented, using lags 2 to 4 only, summed into one column per lag order. The lag window
      is where you control proliferation.`],
    ['iv(x1 x2 i.year)', `Instruments that stand in for themselves: exogenous regressors and year
      dummies. Putting year dummies in gmm() instead is a common and expensive mistake.`],
    ['equation(level)', `Restricts those instruments to the level equation — for a regressor
      exogenous with respect to u but possibly correlated with μ<sub>i</sub>.`],
    ['nolevel', `Drops the level equation, turning the command into Difference GMM. The one-word
      switch between estimators.`],
    ['twostep', `Builds the weight matrix from first-step residuals. Efficient, and required if
      you want Hansen rather than Sargan.`],
    ['robust', `With twostep this applies the Windmeijer correction. Without it the standard
      errors are badly understated.`],
    ['small', 'Reports t and F rather than z and χ², which matters when N is not large.']
  ],
  r: [
    ['lag(y, 2:4)', `The instrument block after the vertical bar. Writing 2:99 hands over every
      available lag; a narrow window is the R equivalent of Stata's lag() option.`],
    ['transformation = "ld"', 'Levels and differences stacked, which is System GMM. Use "d" for Difference GMM.'],
    ['model = "twosteps"', 'Two-step GMM. Pair with robust = TRUE in summary() for the Windmeijer correction.'],
    ['collapse = TRUE', `Collapses the instrument matrix. Without it, pgmm on a long panel will
      build more columns than you have units.`],
    ['effect = "twoways"', `Adds time effects alongside individual effects. Skip only if you are
      certain there are no common shocks.`],
    ['robust = TRUE', 'Belongs in summary(), not pgmm(). This is where the corrected standard errors come from.']
  ],
  javascript: [
    ['equations = t - 2', `The differenced equation only exists for t = 3 … T: one period goes to
      the lag, one to the difference. This is the row count per unit.`],
    ['h.set(q, q, 2)', `The one-step weight matrix. 2 on the diagonal and −1 either side is
      exactly the MA(1) covariance that differencing induces in Δu.`],
    ['collapse', `The branch that decides the instrument layout: one column per lag order, or one
      column per period per lag. Everything in the proliferation note is this if-statement.`],
    ['z.set(lvl, diffCols + ...)', `The System GMM addition — a lagged difference instrumenting the
      level equation, written into the columns past the differenced block.`],
    ['invert(a, 1e-8)', `A ridge on the diagonal, because A goes singular for real once the
      instrument count outruns the sample. Returning NaN there is honest; a fabricated number is not.`]
  ],
  csharp: [
    ['double[][] panel', `A jagged array rather than double[,]: each unit's row is contiguous and
      indexing it is a single bounds check, which matters in the inner loop.`],
    ['readonly record struct', `Summary and Replication are value types with structural equality —
      the natural shape for a small immutable result, and no heap traffic per replication.`],
    ['Matrix? Invert', `Nullable reference types are on, so the compiler forces the caller to handle
      the singular case before dereferencing.`],
    ['MultiplyTransposed', `A'B without materialising A'. The transpose would be pure allocation:
      the loop order is the only thing that changes.`],
    ['double.IsFinite(v)', `Replications can legitimately return NaN. Summaries skip them rather
      than propagating, and report how many actually counted.`]
  ],
  cpp: [
    ['std::uint32_t state_', `Fixed-width and unsigned: the RNG relies on defined wraparound, and
      unsigned overflow is defined where signed overflow is undefined behaviour.`],
    ['x ^= x >> 17', `A logical shift, because the operand is unsigned. On a signed type this
      would be an arithmetic shift and the stream would diverge from the JavaScript.`],
    ['panel.push_back(std::move(row))', `Moves the row's buffer into the panel instead of copying
      it — the one place in this file where the copy would actually show up.`],
    ['const Matrix&', `Matrices are passed by const reference throughout. The estimator allocates
      per unit as it is; there is no reason to add a copy at every call.`],
    ['Multiply(rzw, zr).At(0, 0)', `The scalar denominator of the one-line GMM solution. With a
      single regressor the whole estimator collapses to two 1x1 products.`]
  ]
};

const TAB_ORDER = ['stata', 'r', 'javascript', 'csharp', 'cpp'];

export function code(slot) {
  let current = 'stata';

  slot.innerHTML = `
    <div class="tool">
      <div class="ctl tight" role="tablist" aria-label="Language">
        ${TAB_ORDER.map((key) => `
          <button class="btn${key === current ? ' on' : ''}" role="tab" data-lang="${key}"
                  aria-selected="${key === current}">${escapeHtml(SNIPPETS[key].language)}</button>`).join('')}
        <button class="btn push" data-copy>Copy</button>
      </div>
      <p class="hint" data-source></p>
      <pre><code data-code></code></pre>
      <div class="ctl" data-chips></div>
      <div class="vd nu" data-say>Tap an option above.</div>
    </div>`;

  const $ = qs(slot);

  function render() {
    const snippet = SNIPPETS[current];
    $('[data-code]').textContent = snippet.code;
    $('[data-source]').innerHTML = `From <code>${escapeHtml(snippet.file)}</code>`;

    $('[data-chips]').innerHTML = ANNOTATIONS[current]
      .map(([token], i) => `<button class="btn" data-annotation="${i}">
        <code class="bare">${escapeHtml(token)}</code></button>`).join('');

    for (const button of $('[data-chips]').querySelectorAll('[data-annotation]')) {
      button.onclick = () => {
        for (const other of $('[data-chips]').querySelectorAll('[data-annotation]')) {
          other.classList.toggle('on', other === button);
        }
        const [token, explanation] = ANNOTATIONS[current][Number(button.dataset.annotation)];
        verdict($('[data-say]'), 'hm', `<b><code>${escapeHtml(token)}</code></b><br>${explanation}`);
      };
    }

    for (const tab of slot.querySelectorAll('[data-lang]')) {
      const on = tab.dataset.lang === current;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    }

    verdict($('[data-say]'), 'nu', 'Tap an option above.');
  }

  for (const tab of slot.querySelectorAll('[data-lang]')) {
    tab.onclick = () => { current = tab.dataset.lang; render(); };
  }

  $('[data-copy]').onclick = async (event) => {
    const button = event.currentTarget;
    const text = SNIPPETS[current].code;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to the old trick.
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.className = 'offscreen';
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand('copy');
      scratch.remove();
    }
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1300);
  };

  render();
}

/* -------------------------------------------------------- implementations ---- */

export function implementations(slot) {
  slot.innerHTML = `
    <div class="tool">
      <h3>Run the JavaScript implementation at a fixed seed</h3>
      <p class="hint">The C# and C++ ports, given the same seed, produce these numbers to within
        floating-point noise. That is the whole claim, and it is checkable.</p>
      <div class="row">
        <div class="fld"><label for="impl-seed">Seed</label>
          <input id="impl-seed" type="number" data-seed min="1" step="1" value="12345"></div>
        <div class="fld"><label for="impl-n">Units N</label>
          <input id="impl-n" type="number" data-n min="10" max="1000" step="10" value="100"></div>
        <div class="fld"><label for="impl-t">Periods T</label>
          <input id="impl-t" type="number" data-t min="4" max="12" step="1" value="6"></div>
        <div class="fld"><label for="impl-rho">True ρ</label>
          <input id="impl-rho" type="number" data-rho min="0" max="0.95" step="0.05" value="0.6"></div>
      </div>
      <p class="err" data-error role="alert">Seed must be a positive integer; ρ must sit inside [0, 0.95].</p>
      <div class="ctl"><button class="btn pri" data-run>Estimate one panel</button></div>
      <div data-out></div>
    </div>`;

  const $ = qs(slot);
  const error = $('[data-error]');

  for (const input of slot.querySelectorAll('input')) {
    input.oninput = () => { error.style.display = 'none'; };
  }

  $('[data-run]').onclick = () => {
    const seed = Number.parseInt($('[data-seed]').value, 10);
    const n = Number.parseInt($('[data-n]').value, 10);
    const t = Number.parseInt($('[data-t]').value, 10);
    const rho = Number.parseFloat($('[data-rho]').value);

    if (!Number.isInteger(seed) || seed < 1 || !Number.isFinite(rho) || rho < 0 || rho > 0.95
      || !Number.isInteger(n) || n < 10 || !Number.isInteger(t) || t < 4) {
      error.style.display = 'block';
      $('[data-out]').innerHTML = '';
      return;
    }
    error.style.display = 'none';

    const panel = drawPanel(n, t, rho, 1, new Rng(seed));
    const estimates = [
      ['pooled OLS', pooledOls(panel)],
      ['fixed effects', withinFe(panel)],
      ['Difference GMM', differenceGmm(panel, true)],
      ['System GMM', systemGmm(panel, true)]
    ];

    const flags = `--n ${n} --t ${t} --rho ${rho} --seed ${seed} --reps 1`;

    $('[data-out]').innerHTML = `
      <table class="t num">
        <tr><th>estimator</th><th class="asis">ρ̂</th><th>error</th></tr>
        ${estimates.map(([name, value]) => `
          <tr><td>${name}</td><td>${value.toFixed(6)}</td>
            <td>${value - rho >= 0 ? '+' : ''}${(value - rho).toFixed(6)}</td></tr>`).join('')}
      </table>
      <div class="vd nu">Reproduce the same four numbers outside the browser:
        <pre><code>node reference/js/cli.mjs ${escapeHtml(flags)}
cd reference/cpp &amp;&amp; make &amp;&amp; ./gmm ${escapeHtml(flags)}
cd reference/csharp/DynamicPanel &amp;&amp; dotnet run -- ${escapeHtml(flags)}</code></pre>
      </div>`;
  };
}

/* ------------------------------------------------------------ walkthrough ---- */

const STEPS = [
  ['Set it up', `
    <p>T = 6 puts you in the small-T regime: the calculator in
      <a class="wl" href="#nickell-bias" data-open="nickell-bias">Nickell bias</a> says fixed
      effects will lose about half of ρ.</p>
    <p class="hint">Before estimating anything, run pooled OLS and FE. Those two numbers are the
      bracket your GMM estimate has to land inside, and they cost nothing.</p>`],
  ['Estimate', `
    <pre><code>dyn &lt;- pgmm(y ~ lag(y,1) + x | lag(y,2),
            data = pdata, effect = "individual",
            model = "twosteps", transformation = "ld",
            collapse = TRUE)
summary(dyn, robust = TRUE)</code></pre>
    <p>One lag of instruments, collapsed, system transformation, two-step with corrected errors.
      Uncollapsed, the differenced block alone would be 10 columns here.</p>`],
  ['Read the tests', `
    <table class="t">
      <tr><td>ρ̂ on lag(y)</td><td>≈ 0.60</td></tr>
      <tr><td>AR(1)</td><td>p = 0.01</td></tr>
      <tr><td>AR(2)</td><td>p = 0.47</td></tr>
      <tr><td>Hansen J</td><td>χ² = 15.2, df = 20, p = 0.52</td></tr>
      <tr><td>Wald</td><td>p &lt; 0.01</td></tr>
    </table>
    <p>AR(1) rejecting is the MA(1) structure on cue. AR(2) at 0.47 says u is serially
      uncorrelated, so lag 2 was legitimate. Hansen at 0.52 sits in the honest middle.</p>`],
  ['Sanity-check it', `
    <p>Place ρ̂ = 0.60 against the bracket. At 0.85, above OLS, you would suspect the level
      moments; at 0.25, below FE, weak instruments in the differenced block.</p>
    <p class="hint">Report: ρ̂ with corrected errors, N, instrument count, AR(1), AR(2), Hansen,
      and difference-in-Hansen for System GMM. Six numbers and the specification defends itself.</p>`]
];

export function walkthrough(slot) {
  let index = 0;

  slot.innerHTML = `
    <div class="tool">
      <div class="ctl tight" data-steps role="tablist" aria-label="Step"></div>
      <div data-body></div>
      <div class="ctl">
        <button class="btn" data-prev>Back</button>
        <button class="btn pri" data-next>Next step</button>
      </div>
    </div>`;

  const $ = qs(slot);

  function render() {
    $('[data-steps]').innerHTML = STEPS.map(([title], i) => `
      <button class="btn${i === index ? ' on' : ''}" role="tab" data-step="${i}"
              aria-selected="${i === index}">${i + 1}. ${escapeHtml(title)}</button>`).join('');
    $('[data-body]').innerHTML = STEPS[index][1];

    for (const button of $('[data-steps]').querySelectorAll('[data-step]')) {
      button.onclick = () => { index = Number(button.dataset.step); render(); };
    }
    $('[data-next]').textContent = index === STEPS.length - 1 ? 'Back to start' : 'Next step';
  }

  $('[data-prev]').onclick = () => { index = (index - 1 + STEPS.length) % STEPS.length; render(); };
  $('[data-next]').onclick = () => { index = (index + 1) % STEPS.length; render(); };

  render();
}
