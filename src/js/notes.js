/**
 * Vault content. Each note is {id, title, folder, tags, tools, body}.
 *
 * `body` is HTML with [[wikilinks]]; `tools` names the interactive widgets that
 * fill the note's `<div data-tool>` slots, in order.
 */

export const NOTES = [
{ id: 'today', title: 'Today', folder: 'Daily', tags: ['planner'], tools: ['hero', 'planner', 'pomodoro'], body: `
<div data-tool></div>
<div data-tool></div>
<div data-tool></div>
<h2>Where to go next</h2>
<p>New here? [[start-here|Start here]] lays out the reading order. Working through it already?
Pick up at the [[review|review queue]], which fills itself from what you have missed, or open the
[[simulation|simulation lab]] and watch the estimators come apart at ρ = 0.9.</p>
<p class="mini">The plan and the focus tally are kept in this browser only — they never leave your
device, and they reset when you clear site data.</p>` },

{ id: 'start-here', title: 'Start here', folder: 'Setup', tags: ['moc'], body: `
<p>A vault for dynamic panel estimation: models with a lagged dependent variable, a fixed effect, and not enough time periods to ignore the interaction between them.</p>
<div class="callout" data-t="quote"><div class="ct">The object of study</div><p class="m" style="font-size:1.05rem">y<sub>it</sub> = ρ y<sub>i,t−1</sub> + X<sub>it</sub>β + μ<sub>i</sub> + u<sub>it</sub></p><p>N units, T periods, T short. Every note here is about one consequence of that setup.</p></div>
<h2>Read in this order</h2>
<ul>
<li>[[panel-grid|The panel grid]] — click through the data and see which lags are legal instruments.</li>
<li>[[nickell-bias|Nickell bias]] — why fixed effects fails, and by how much.</li>
<li>[[difference-gmm|Difference GMM]] then [[system-gmm|System GMM]] — the two estimators.</li>
<li>[[moment-conditions|Moment conditions]] — the four lines worth memorising.</li>
<li>[[choosing|Choosing an estimator]] — a decision tree that answers itself.</li>
</ul>
<h2>Then the practical half</h2>
<ul>
<li>[[instruments|Instrument proliferation]] — the failure mode nobody writes down.</li>
<li>[[diagnostics|Diagnostics]], [[ar-tests|AR tests]], [[hansen|Hansen test]], [[windmeijer|Windmeijer correction]].</li>
<li>[[code|Code in five languages]] and a [[worked-pass|worked pass]] end to end.</li>
<li>[[simulation|Simulation lab]] — generate panels in the browser and watch all four estimators miss.</li>
<li>[[implementations|Implementations]] — the same estimator in JavaScript, C# and C++, checked against each other.</li>
<li>[[flashcards|Flashcards]], [[quiz|Quiz]], [[review|Review queue]], [[cheat-sheet|Cheat sheet]].</li>
</ul>
<hr><p class="mini">Links open to the right, so the trail you followed stays visible. The graph button in the ribbon shows how the notes connect; <kbd>Ctrl</kbd>+<kbd>P</kbd> jumps anywhere, and <kbd>Ctrl</kbd>+<kbd>P</kbd> then <code>&gt;</code> runs a command. [[today|Today]] has the planner and the timer.</p>` },

{ id: 'panel-grid', title: 'The panel grid', folder: 'Setup', tags: ['intuition', 'small-t'], tools: ['grid'], body: `
<p>Everything in this vault happens inside one object. Four units down, six periods across. Each row shares a single <span class="m">μ<sub>i</sub></span>, which is exactly what breaks the lagged dependent variable.</p>
<p>Switch views and click a period column. The grid shows which equation you are estimating and which cells are allowed to instrument it. Turn on real numbers to fill it with a simulated draw, and resample to see the same structure over new data.</p>
<div data-tool></div>
<h2>What the four views say</h2>
<ul>
<li><b>Raw levels.</b> The fixed effect sits in every cell of a row and in the regressor. Pooled OLS absorbs it and pushes ρ̂ up; fixed effects drags it down. See [[nickell-bias|Nickell bias]].</li>
<li><b>First differences.</b> <span class="m">μ<sub>i</sub></span> is gone, t = 1 goes with it, and Δu is now MA(1). That MA(1) structure is the whole reason the [[ar-tests|AR(1) test]] rejects.</li>
<li><b>Instruments.</b> Levels dated t−2 and deeper are clear of Δu<sub>it</sub>. That is [[difference-gmm|Difference GMM]].</li>
<li><b>System GMM.</b> Two equations at once, each instrumented by the other's transformation. See [[system-gmm|System GMM]].</li>
</ul>` },

{ id: 'nickell-bias', title: 'Nickell bias', folder: 'Setup', tags: ['bias', 'small-t'], tools: ['nickell'], body: `
<p>The reason none of the standard panel estimators work here. Within-group demeaning subtracts an average that contains <span class="m">u<sub>it</sub></span>, so the transformed lag and the transformed error move together.</p>
<div class="eq">plim<sub>N→∞</sub> (ρ̂<sub>FE</sub> − ρ) ≈ −(1 + ρ) / (T − 1)
<small>Leading term for the pure AR(1) case, T fixed. Negative, and O(1/T).</small></div>
<div data-tool></div>
<div class="callout" data-t="succ"><div class="ct">The useful corollary</div><p>Because the bias runs downward for FE and upward for pooled OLS, the two estimates form a bracket. A GMM estimate outside it is wrong before you look at a single test. See [[cheat-sheet|cheat sheet]].</p></div>
<p>The formula is a leading term, not a promise: in the [[simulation|simulation lab]] the realised FE bias usually runs a little past it — at ρ = 0.6 and T = 6 the formula says 0.28 and the simulation lands near 0.23. Source: [[nickell-1981|Nickell 1981]]. Response: [[arellano-bond-1991|Arellano–Bond 1991]].</p>` },

{ id: 'difference-gmm', title: 'Difference GMM', folder: 'Estimators', tags: ['estimator'], tools: ['weak'], body: `
<p>Difference the equation to kill the fixed effect, then instrument the differenced lag with levels from further back.</p>
<div class="eq">Δy<sub>it</sub> = ρ Δy<sub>i,t−1</sub> + ΔX<sub>it</sub>β + Δu<sub>it</sub>, &nbsp; t = 3, …, T
<small>μ<sub>i</sub> is gone. In exchange, Δu<sub>it</sub> is MA(1) and the first usable period is lost.</small></div>
<p>The regressor <span class="m">Δy<sub>i,t−1</sub></span> is endogenous by construction: it contains <span class="m">u<sub>i,t−1</sub></span>, and so does <span class="m">Δu<sub>it</sub></span>. Levels dated t−2 and earlier are clear of that overlap, which gives the [[moment-conditions|moment conditions]].</p>
<h2>What it asks of you</h2>
<ul>
<li>Choose a lag window. Lag 2 onward is standard; if [[ar-tests|AR(2)]] rejects, start at 3.</li>
<li>Add lagged levels of predetermined regressors; strictly exogenous ones instrument themselves.</li>
<li>Two-step for efficiency, plus the [[windmeijer|Windmeijer correction]] for the standard errors.</li>
<li>Collapse or cap before the count outruns N. See [[instruments|instrument proliferation]].</li>
</ul>
<div class="callout" data-t="warn"><div class="ct">Where it fails</div><p>As ρ approaches 1, <span class="m">y<sub>i,t−2</sub></span> barely predicts <span class="m">Δy<sub>i,t−1</sub></span> — a random walk has no news in its level. Weak instruments pull ρ̂ toward zero. That failure is what [[system-gmm|System GMM]] exists to fix.</p></div>
<h2>How weak, exactly?</h2>
<p>The instrument only works through its correlation with the differenced lag it stands in for. Here is that correlation, simulated, as ρ moves toward 1.</p>
<div data-tool></div>
<p>See it in the [[panel-grid|panel grid]], test it in the [[simulation|simulation lab]], run it in [[code|code]], choose it in [[choosing|choosing an estimator]].</p>` },

{ id: 'system-gmm', title: 'System GMM', folder: 'Estimators', tags: ['estimator'], body: `
<p>Keep the differenced equation, stack the level equation underneath it, and instrument the levels with differences.</p>
<div class="eq">y<sub>it</sub> = ρ y<sub>i,t−1</sub> + X<sub>it</sub>β + μ<sub>i</sub> + u<sub>it</sub>
<small>The level equation still carries μ<sub>i</sub>, so its instruments must be uncorrelated with the fixed effect, not merely with u<sub>it</sub>.</small></div>
<div class="eq">E[ Δy<sub>i,t−1</sub> u<sub>it</sub> ] = 0
<small>Lagged differences instrument levels, valid under mean stationarity of the initial conditions.</small></div>
<h2>The assumption you are buying</h2>
<p>That the deviation of <span class="m">y<sub>i1</sub></span> from its long-run mean is uncorrelated with <span class="m">μ<sub>i</sub></span> — units start near their own steady state rather than converging from far away. In a growth panel with poor countries catching up, this is a real restriction, and the difference-in-[[hansen|Hansen]] test is where it gets examined.</p>
<table class="t"><tr><th>Gain</th><th>Risk</th></tr>
<tr><td class="wrap">Precision when the series is persistent; a usable estimate where [[difference-gmm|Difference GMM]] collapses toward zero; identification for time-invariant regressors.</td>
<td class="wrap">Roughly twice the instruments, one extra assumption, and a Hansen test quietly losing power as the count climbs.</td></tr></table>
<p>Watch the trade in the [[simulation|simulation lab]]: at ρ = 0.9 Difference GMM comes apart while this holds. Origins: [[arellano-bond-1991|Arellano–Bond]] → Arellano–Bover 1995 → [[blundell-bond-1998|Blundell–Bond 1998]].</p>` },

{ id: 'moment-conditions', title: 'Moment conditions', folder: 'Estimators', tags: ['reference'], body: `
<p>Four lines. If you can write these from memory you can reconstruct both estimators.</p>
<div class="eq" data-n="1">E[ y<sub>i,t−s</sub> Δu<sub>it</sub> ] = 0, &nbsp; s = 2, …, t−1
<small>Differenced equation, lagged levels as instruments. Requires u<sub>it</sub> serially uncorrelated — which is what [[ar-tests|AR(2)]] checks.</small></div>
<div class="eq" data-n="2">E[ Δy<sub>i,t−1</sub> u<sub>it</sub> ] = 0
<small>Level equation, lagged differences as instruments. Requires mean stationarity. This is the [[system-gmm|System GMM]] addition.</small></div>
<div class="eq" data-n="3">(R′Z W Z′R) θ̂ = R′Z W Z′y
<small>The estimator itself. R holds the regressors, Z the instruments, W the weight matrix. This line is literally what [[implementations|the code]] solves.</small></div>
<div class="eq" data-n="4">W = (Z′HZ)<sup>−1</sup> one-step; &nbsp; W = (Z′Ω̂Z)<sup>−1</sup> two-step
<small>One-step uses a fixed H — 2 on the diagonal, −1 off it, the MA(1) structure of Δu. Two-step builds Ω̂ from first-step residuals: efficient, but see [[windmeijer|Windmeijer]].</small></div>
<div class="callout" data-t="dang"><div class="ct">The exam trap</div><p>Which transformation instruments which equation. Levels instrument the <i>differenced</i> equation; differences instrument the <i>level</i> equation. Say it backwards in a viva and nothing you say afterwards will land.</p></div>` },

{ id: 'choosing', title: 'Choosing an estimator', folder: 'Estimators', tags: ['decision'], tools: ['chooser'], body: `
<p>Three questions settle it, and none of them is about your coefficient. The estimator follows from the shape of the data.</p>
<div data-tool></div>
<p>Related: [[nickell-bias|Nickell bias]] for whether T is short enough to care, [[difference-gmm|Difference GMM]] and [[system-gmm|System GMM]] for what you are committing to.</p>` },

{ id: 'instruments', title: 'Instrument proliferation', folder: 'Practice', tags: ['pitfall'], tools: ['counter'], body: `
<p>Every lag of every endogenous variable is another column in <span class="m">Z</span>. The count grows with the square of T while your sample does not.</p>
<div data-tool></div>
<h2>Why it matters more than it looks</h2>
<ul>
<li>With too many moment conditions the two-step weight matrix is estimated from too little information, and ρ̂ drifts back toward the biased OLS or FE value it was meant to fix.</li>
<li>The [[hansen|Hansen test]] loses power as the count rises. A p-value near 1 is a test that can no longer detect anything.</li>
<li>Collapsing sums each moment condition across periods instead of keeping one per period per lag. Identification survives; redundancy goes. You can see the two layouts side by side in [[implementations|the code]].</li>
</ul>
<div class="callout" data-t="warn"><div class="ct">Report it</div><p>Put the instrument count next to N in every table. A count above N is a specification you have to defend, not one you publish quietly. From [[roodman-2009|Roodman 2009]].</p></div>` },

{ id: 'diagnostics', title: 'Diagnostics', folder: 'Practice', tags: ['testing'], tools: ['diag'], body: `
<p>Two tests carry the specification: [[ar-tests|AR(2)]] for the error structure, [[hansen|Hansen J]] for the instruments. Paste your output and read them together.</p>
<div data-tool></div>
<table class="t">
<tr><th>Test</th><th>Null</th><th>What you want</th></tr>
<tr><td>AR(1) in Δu</td><td class="wrap">no first-order correlation</td><td class="wrap">Rejection, mechanically. See [[ar-tests|AR tests]].</td></tr>
<tr><td>AR(2) in Δu</td><td class="wrap">no second-order correlation</td><td class="wrap">No rejection. This licenses lag 2 as an instrument.</td></tr>
<tr><td>Sargan</td><td class="wrap">instruments exogenous</td><td class="wrap">No rejection, but it assumes homoskedasticity.</td></tr>
<tr><td>Hansen J</td><td class="wrap">instruments exogenous</td><td class="wrap">No rejection, and not a p near 1.</td></tr>
<tr><td>Diff-in-Hansen</td><td class="wrap">the level moments are valid</td><td class="wrap">No rejection. The test of [[system-gmm|mean stationarity]].</td></tr>
</table>` },

{ id: 'ar-tests', title: 'AR tests', folder: 'Practice', tags: ['testing'], body: `
<p>Arellano and Bond's test for serial correlation, run on the residuals of the differenced equation. Two readings, routinely confused.</p>
<h2>AR(1) rejects, and that is fine</h2>
<p>Differencing makes <span class="m">Δu<sub>it</sub></span> and <span class="m">Δu<sub>i,t−1</sub></span> share <span class="m">u<sub>i,t−1</sub></span>. The correlation is manufactured by the transformation, so rejection is the expected reading. Report it, do not interpret it.</p>
<h2>AR(2) is the one that matters</h2>
<p>Second-order correlation in <span class="m">Δu</span> would mean first-order correlation in <span class="m">u</span> itself, which invalidates <span class="m">y<sub>i,t−2</sub></span> as an instrument. Failing to reject is what licenses [[moment-conditions|moment condition 1]].</p>
<div class="callout" data-t="dang"><div class="ct">If AR(2) rejects</div><p>Move the lag window one period deeper — instruments from lag 3 — or respecify the dynamics; an additional lag of y on the right-hand side often absorbs the correlation. Do not proceed on the grounds that everything else looks fine.</p></div>
<p>Interpret real numbers in [[diagnostics|diagnostics]].</p>` },

{ id: 'hansen', title: 'Hansen test', folder: 'Practice', tags: ['testing'], body: `
<p>A test of the overidentifying restrictions as a set. Null: the instruments are uncorrelated with the error.</p>
<table class="t"><tr><th></th><th>Sargan 1958</th><th>Hansen J 1982</th></tr>
<tr><td>Assumes</td><td class="wrap">homoskedasticity</td><td class="wrap">nothing extra</td></tr>
<tr><td>Quote it when</td><td class="wrap">one-step, non-robust</td><td class="wrap">two-step robust</td></tr></table>
<h2>It fails in two directions</h2>
<ul>
<li><b>p below 0.05.</b> The restrictions are rejected. Something in <span class="m">Z</span> is correlated with the error; drop the suspect block or shorten the lag window.</li>
<li><b>p near 1.</b> Not a clean bill of health. Almost always [[instruments|too many instruments]], leaving a test with no power to detect a violation.</li>
</ul>
<div class="callout" data-t="quote"><div class="ct">Difference-in-Hansen</div><p>The incremental version: compares the Hansen statistic with and without the level-equation moments. This is the test of [[system-gmm|System GMM]]'s mean-stationarity assumption, and the one referees ask for.</p></div>` },

{ id: 'windmeijer', title: 'Windmeijer correction', folder: 'Practice', tags: ['testing', 'reference'], body: `
<p>Two-step GMM is efficient, but its standard errors are severely downward biased in finite samples: the weight matrix is estimated from first-step residuals, and the usual formula ignores that estimation.</p>
<p>Windmeijer's 2005 correction adjusts the covariance matrix for the dependence of the weight matrix on the first-step estimates. Without it, everything looks sharper than it is.</p>
<div class="callout" data-t="succ"><div class="ct">In practice</div><p>In Stata, <code>twostep robust</code> applies it. In R, <code>summary(model, robust = TRUE)</code> after a <code>model = "twosteps"</code> fit. See [[code|code]].</p></div>
<p>Paper: [[windmeijer-2005|Windmeijer 2005]].</p>` },

{ id: 'code', title: 'Code in five languages', folder: 'Practice', tags: ['code'], tools: ['code'], body: `
<p>The same model in five ecosystems. Stata and R are what you would actually run on data; JavaScript, C# and C++ are the estimator itself, so you can see what <code>xtabond2</code> does rather than trusting it.</p>
<p>Every block below is extracted from a real file in this repository — nothing here is a paraphrase. Tap any option to see what it changes and what breaks without it.</p>
<div data-tool></div>
<h2>Mistakes that survive peer review</h2>
<ul>
<li>Quoting Sargan from a two-step robust run, where only [[hansen|Hansen]] applies.</li>
<li>Leaving instruments uncollapsed, then reporting Hansen p = 0.99 as a good sign.</li>
<li>Two-step standard errors without the [[windmeijer|Windmeijer correction]].</li>
<li>Putting year dummies in the GMM instrument block instead of the IV block.</li>
<li>Running [[system-gmm|System GMM]] on a panel long enough that FE was never biased.</li>
</ul>
<p>How the three compiled implementations are kept honest: [[implementations|Implementations]].</p>` },

{ id: 'implementations', title: 'Implementations', folder: 'Practice', tags: ['code', 'simulation'], tools: ['impl'], body: `
<p>The estimator in <a class="wl" data-open="moment-conditions">moment condition 3</a> is about forty lines of arithmetic. This repository carries it three times — once in JavaScript, once in C#, once in C++ — and checks the three against each other.</p>
<h2>Why three</h2>
<ul>
<li><b>JavaScript</b> is the one the [[simulation|simulation lab]] runs, live, in this page.</li>
<li><b>C#</b> and <b>C++</b> exist because a port is the cheapest proof that you understood the algorithm rather than the library. If your port disagrees, one of you is wrong, and the disagreement is specific.</li>
</ul>
<h2>The trick that makes them comparable</h2>
<p>All three share a deliberately boring random number generator: xorshift32 for the uniform, Box–Muller for the normal, with a 24-bit mantissa so no language rounds differently. Seeded identically, they walk the same stream, so the estimates should agree to floating-point noise rather than merely "look similar".</p>
<div data-tool></div>
<div class="callout" data-t="succ"><div class="ct">What the check actually asserts</div><p><code>npm run crosscheck</code> runs all three drivers at the same seed and fails if any estimate differs by more than 1e-9 relative. Observed: about 2e-16, which is one unit in the last place.</p></div>
<h2>Where the files are</h2>
<table class="t"><tr><th>Language</th><th>Path</th></tr>
<tr><td>JavaScript</td><td class="wrap"><code>src/js/sim/gmm.js</code> — also what this page runs</td></tr>
<tr><td>C#</td><td class="wrap"><code>reference/csharp/DynamicPanel/</code> — <code>dotnet run</code></td></tr>
<tr><td>C++</td><td class="wrap"><code>reference/cpp/</code> — <code>make &amp;&amp; ./gmm</code></td></tr>
<tr><td>Stata</td><td class="wrap"><code>reference/stata/dynamic_panel.do</code></td></tr>
<tr><td>R</td><td class="wrap"><code>reference/r/dynamic_panel.R</code></td></tr>
</table>
<p>The blocks shown in [[code|the Code note]] are extracted from these files at build time, so the note cannot drift away from the source.</p>` },

{ id: 'worked-pass', title: 'Worked pass', folder: 'Practice', tags: ['example'], tools: ['walk'], body: `
<p>N = 100, T = 6, true ρ = 0.6, β = 0.5, with <span class="m">μ<sub>i</sub></span> and <span class="m">ε<sub>it</sub></span> standard normal. Step through the run you would actually do.</p>
<div data-tool></div>` },

{ id: 'flashcards', title: 'Flashcards', folder: 'Review', tags: ['drill'], tools: ['cards'], body: `
<p>Ten cards for the things you need verbatim: both [[moment-conditions|moment conditions]], Sargan versus [[hansen|Hansen]], the sanity bracket.</p>
<div data-tool></div>` },

{ id: 'quiz', title: 'Quiz', folder: 'Review', tags: ['drill'], tools: ['quiz'], body: `
<p>Ten questions on the things people actually get wrong. Wrong answers explain themselves, and what you miss lands in the [[review|review queue]].</p>
<div data-tool></div>` },

{ id: 'cheat-sheet', title: 'Cheat sheet', folder: 'Review', tags: ['reference'], body: `
<p>The note to keep open while you write up.</p>
<table class="t">
<tr><th>Item</th><th>Rule</th></tr>
<tr><td>Δy equation</td><td class="wrap">Instruments are levels y<sub>i,t−2</sub> and deeper. E[y<sub>i,t−s</sub> Δu<sub>it</sub>] = 0, s ≥ 2.</td></tr>
<tr><td>y equation</td><td class="wrap">Instruments are differences Δy<sub>i,t−1</sub>. E[Δy<sub>i,t−1</sub> u<sub>it</sub>] = 0, under mean stationarity.</td></tr>
<tr><td>AR(1)</td><td class="wrap">Expect rejection. Ignore it.</td></tr>
<tr><td>AR(2)</td><td class="wrap">Must not reject. If it does, instruments start at lag 3.</td></tr>
<tr><td>Hansen J</td><td class="wrap">p above 0.05 and well below 0.9. Report the instrument count beside it.</td></tr>
<tr><td>Two-step SEs</td><td class="wrap">Windmeijer, always.</td></tr>
<tr><td>Bracket</td><td class="wrap">ρ̂<sub>FE</sub> &lt; ρ̂<sub>GMM</sub> &lt; ρ̂<sub>OLS</sub>.</td></tr>
<tr><td>Count</td><td class="wrap">Uncollapsed diff GMM ≈ (T−1)(T−2)/2 per endogenous variable; collapsed ≈ T−2.</td></tr>
<tr><td>Stata</td><td class="wrap"><code>xtabond2 y L.y x, gmm(L.y, collapse) iv(x) twostep robust</code>; add <code>nolevel</code> for Difference GMM.</td></tr>
<tr><td>R</td><td class="wrap"><code>pgmm(..., model="twosteps", transformation="ld", collapse=TRUE)</code></td></tr>
<tr><td>Prefer diff</td><td class="wrap">ρ comfortably below 1, or the level moments get rejected.</td></tr>
<tr><td>Prefer system</td><td class="wrap">Persistent series, very short T, or regressors differencing would remove.</td></tr>
</table>
<p>Unpacked in [[moment-conditions|moment conditions]], [[diagnostics|diagnostics]] and [[instruments|instrument proliferation]].</p>` },

{ id: 'nickell-1981', title: 'Nickell 1981', folder: 'Literature', tags: ['paper'], body: `
<p><i>Biases in dynamic models with fixed effects</i>, Econometrica.</p>
<p>Puts a number on the problem: the fixed-effects estimator of ρ is biased by roughly <span class="m">−(1+ρ)/(T−1)</span>. Short panels, real damage; long panels, none. Every paper below is a response to this one.</p>
<p>→ [[nickell-bias|Nickell bias]], with a calculator.</p>` },

{ id: 'arellano-bond-1991', title: 'Arellano–Bond 1991', folder: 'Literature', tags: ['paper'], body: `
<p><i>Some tests of specification for panel data</i>, Review of Economic Studies.</p>
<p>Difference GMM in full: one-step and two-step estimators, the lagged-level moment conditions, and the serial correlation tests that still carry their names. Builds on Holtz-Eakin, Newey and Rosen (1988), who had the instruments but not the GMM framing.</p>
<p>→ [[difference-gmm|Difference GMM]], [[ar-tests|AR tests]].</p>` },

{ id: 'blundell-bond-1998', title: 'Blundell–Bond 1998', folder: 'Literature', tags: ['paper'], body: `
<p><i>Initial conditions and moment restrictions in dynamic panel data models</i>, Journal of Econometrics.</p>
<p>Formalises System GMM using Arellano and Bover's (1995) insight that lagged differences can instrument the level equation — and, more usefully, shows exactly when Difference GMM falls apart: persistent series, where lagged levels are weak.</p>
<p>→ [[system-gmm|System GMM]]. Reproduce the result yourself in the [[simulation|simulation lab]] at ρ = 0.9.</p>` },

{ id: 'windmeijer-2005', title: 'Windmeijer 2005', folder: 'Literature', tags: ['paper'], body: `
<p><i>A finite sample correction for the variance of linear efficient two-step GMM estimators</i>, Journal of Econometrics.</p>
<p>Shows how badly two-step standard errors understate uncertainty in small samples, and supplies the correction. The reason <code>twostep</code> and <code>robust</code> always travel together.</p>
<p>→ [[windmeijer|Windmeijer correction]].</p>` },

{ id: 'roodman-2009', title: 'Roodman 2009', folder: 'Literature', tags: ['paper'], body: `
<p><i>How to do xtabond2</i> and <i>A note on the theme of too many instruments</i>, Stata Journal and Oxford Bulletin.</p>
<p>Names instrument proliferation as a practical failure mode, introduces collapsing, and argues that a Hansen p-value near 1 is a warning rather than a result. Also the source of the <code>xtabond2</code> command most applied work runs on.</p>
<p>→ [[instruments|Instrument proliferation]], [[code|code]].</p>` },

{ id: 'simulation', title: 'Simulation lab', folder: 'Practice', tags: ['simulation', 'estimator', 'bias'], tools: ['mc'], body: `
<p>Everything else in this vault is an argument about what these estimators do. This note runs them. The panel is generated in your browser from a known ρ, then estimated four ways, hundreds of times over.</p>
<div class="callout" data-t="quote"><div class="ct">The data generating process</div><p class="m">y<sub>it</sub> = ρ y<sub>i,t−1</sub> + μ<sub>i</sub> + ε<sub>it</sub></p><p>Stationary start, twenty burn-in periods, μ<sub>i</sub> and ε<sub>it</sub> normal. Pooled OLS, fixed effects, one-step Difference GMM and one-step System GMM, all estimated from the same draw so the comparison is clean.</p></div>
<div data-tool></div>
<h2>Three experiments worth running</h2>
<ul>
<li><b>ρ = 0.6, T = 6.</b> The textbook case. OLS lands far above, FE far below, both GMM estimators near the truth, and the bracket holds in nearly every draw.</li>
<li><b>ρ = 0.9.</b> [[difference-gmm|Difference GMM]] falls apart — the mean slides down and the spread explodes, because lagged levels stop predicting differences. [[system-gmm|System GMM]] barely notices. This is the [[blundell-bond-1998|Blundell–Bond]] result, reproduced live.</li>
<li><b>T from 6 to 10.</b> The FE bias shrinks roughly like 1/T, exactly as [[nickell-bias|Nickell]] predicts, and at some point GMM stops being worth the trouble.</li>
</ul>
<div class="callout" data-t="warn"><div class="ct">What this is not</div><p>One-step estimators with a fixed weight matrix, no regressors beyond the lag, no time dummies, and no test statistics. It is a bias-and-spread machine, not a replacement for [[code|xtabond2 or pgmm]].</p></div>
<p>Set a seed to make a run reproducible — the same seed gives the same panels in [[implementations|the C# and C++ ports]] too.</p>` },

{ id: 'review', title: 'Review queue', folder: 'Review', tags: ['drill'], tools: ['queue'], body: `
<p>This note fills itself from what you do elsewhere in the vault: questions missed in the [[quiz|quiz]], cards you flagged in [[flashcards|flashcards]], simulations you ran in the [[simulation|lab]]. It survives a reload.</p>
<div data-tool></div>` }
];
