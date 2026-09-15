# GMM vault

An interactive study vault for **dynamic panel estimation** — models with a lagged dependent
variable, a fixed effect, and too few time periods to ignore the interaction between them:

```
y_it = rho * y_i,t-1 + X_it * beta + mu_i + u_it
```

Twenty-five linked notes covering Nickell bias, Difference and System GMM, the moment conditions,
instrument proliferation and the diagnostics — plus a simulation lab that generates panels in the
browser and estimates them four ways, live.

The estimator itself is implemented three times, in JavaScript, C# and C++, and the three are
checked against each other.

## Quick start

```bash
npm start           # http://127.0.0.1:8080
```

The vault is plain ES modules with no dependencies and no build step, but browsers refuse to load
modules over `file://`, so it needs to be served. `npm start` runs a ~70-line static server; any
other static server works equally well.

## Layout

```
index.html                     shell: markup only, no inline script or style
src/
  styles/tokens.css            design tokens, dark and light
  styles/app.css               layout and components
  js/
    notes.js                   vault content: 25 notes with [[wikilinks]]
    graph.js                   link graph, backlinks, edge list, rendering
    router.js                  the pane stack — the only navigation state
    session.js                 read marks, quiz answers, flagged cards, runs
    mathify.js                 upright/italic typesetting for the maths runs
    plots.js                   canvas helpers and the two charts
    main.js                    wiring
    ui/                        panes, explorer, palette, graph view, hover peek
    tools/                     the thirteen interactive widgets
    sim/                       rng.js, linalg.js, gmm.js  ← the JS estimator
    snippets.generated.js      built by tools/snippets.mjs — do not edit
reference/
  js/cli.mjs                   Monte Carlo driver over src/js/sim/gmm.js
  cpp/                         C++17 port + Makefile
  csharp/DynamicPanel/         .NET 8 port
  stata/dynamic_panel.do       what you would actually run on data
  r/dynamic_panel.R
tools/                         snippets, crosscheck, dev server
tests/                         node:test suites
```

## The three implementations

`src/js/sim/gmm.js`, `reference/csharp/DynamicPanel/Estimators.cs` and `reference/cpp/gmm.cpp`
are line-for-line ports of each other. They share a deliberately boring random number generator —
xorshift32 for the uniform, Box–Muller for the normal, with a 24-bit mantissa so no language
rounds differently — which means that **from the same seed they walk the same stream** and should
produce the same estimates.

```bash
node reference/js/cli.mjs --rho 0.9 --reps 200
cd reference/cpp && make && ./gmm --rho 0.9 --reps 200
cd reference/csharp/DynamicPanel && dotnet run -- --rho 0.9 --reps 200
```

`npm run crosscheck` runs every driver that is installed and fails if any estimate differs by more
than `1e-9` relative. Observed on this machine: **2.2e-16**, one unit in the last place. A missing
toolchain is skipped with a note; a toolchain that is present and disagrees is a failure.

## Verifying

```bash
npm test              # 27 tests: the estimators, the link graph, the snippets
npm run crosscheck    # the three implementations against each other
npm run check:snippets
npm run verify        # all of the above
```

The test suite asserts the econometrics, not just that the code runs: pooled OLS is biased upward,
the within estimator downward, the bracket holds, the within bias shrinks like 1/T, System GMM
beats Difference GMM at rho = 0.9, and the first stage collapses as rho approaches one.

## Snippets stay honest

The Code note shows five languages, and every block is extracted at build time from a real file by
`tools/snippets.mjs`, delimited by `#region snippet:core` markers. Change a reference
implementation and `npm run check:snippets` fails until you regenerate, so the note cannot drift
away from the source it claims to be quoting.

```bash
npm run snippets      # regenerate src/js/snippets.generated.js
```

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `P` | Quick switcher; type `>` for commands |
| `Ctrl`/`Cmd` + `G` | Graph view |
| `Ctrl`/`Cmd` + `K` | Filter the note list |
| `Alt` + `←` / `→` | Move between open panes |
| `Esc` | Close any overlay |

## Notes on scope

The simulation lab runs **one-step** estimators with a fixed weight matrix, no regressors beyond
the lag, no time dummies and no test statistics. It is a bias-and-spread machine for building
intuition, not a replacement for `xtabond2` or `pgmm`. The Stata and R files are the ones you would
actually point at data.

Reading order starts at **Start here**; the graph view shows how the notes connect.
