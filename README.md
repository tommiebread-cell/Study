# GMM vault

A study vault for **dynamic panel estimation**, in a warm editorial interface: cream paper,
charcoal ink, one sage accent, and structure carried by hairline rules rather than cards.

It opens on **Today** — a serif hero, a daily planner and a Pomodoro timer — and from there into
the notes.

The econometrics underneath: models with a lagged dependent variable, a fixed effect, and too few
time periods to ignore the interaction between them.

```
y_it = rho * y_i,t-1 + X_it * beta + mu_i + u_it
```

Twenty-six linked notes covering Nickell bias, Difference and System GMM, the moment conditions,
instrument proliferation and the diagnostics — plus a simulation lab that generates panels in the
browser and estimates them four ways, live.

The estimator itself is implemented three times, in JavaScript, C# and C++, and the three are
checked against each other.

## Quick start

```bash
npm install         # esbuild, the only dependency
npm start           # http://127.0.0.1:8080 — the module build, for development
npm run build       # dist/vault.html — one self-contained file, opens from disk
```

During development the vault is plain ES modules, which browsers refuse to load over `file://`,
so `npm start` serves them. `npm run build` rolls everything — 20 modules, both stylesheets — into
a single ~165 KB HTML file with no external references, which you can double-click, email, or drop
on any static host.

`npm run build:artifact` emits the same page without a `<!doctype>`/`<head>`/`<body>` of its own,
which is the shape claude.ai expects when publishing it as an Artifact.

## Design system

| | |
| --- | --- |
| Paper | `#FBFBF9`, with `#F5F5F1` / `#EEEEE8` for sunk surfaces |
| Ink | `#1A1A1A`, warming to `#57574F` and `#8A8A80` as it lightens |
| Accent | Sage `#607764`, deepening to `#4A5E4E` |
| Rules | `#E5E5E0`, one step stronger at `#D3D3CB` |
| Semantics | moss, ochre, slate, brick — low-chroma, never standing in for the accent |
| Display | Playfair Display, for headings and the maths |
| Body | Plus Jakarta Sans |
| Code | IBM Plex Mono |

Radii never exceed 4px, borders stay hairline, and the only two elements with a shadow are the
palette and the graph overlay — the two things that genuinely float. Icons are inline Lucide SVG
(`src/js/icons.js`); there are no emoji or dingbats anywhere in the interface.

The palette is a single committed light theme rather than a light/dark pair, so every colour is
painted explicitly and nothing is inherited from the host.

## Today

`src/js/tools/today.js` holds the three daily tools — the hero, the planner and the timer — as
ordinary vault tools, so they live inside a note pane like everything else rather than floating
above the page as widgets.

Tasks and the focus tally are per-viewer, saved to `localStorage` inside a try/catch, and the
Pomodoro count resets on a new local day.

## Asking Claude

Published as an Artifact, each note gets an **ask** button in its header: a question box that sends
your question plus the note's text to Claude and streams the answer back, on your own Claude
account. It uses the artifact runtime's `sample` capability.

The feature is strictly additive. Anywhere else — the dev server, the standalone file, any other
host — `window.claude` is absent, the capability resolves to nothing, and the button never appears.
Nothing else in the vault depends on it.

## Layout

```
index.html                     shell: markup only, no inline script or style
src/
  styles/tokens.css            design tokens: paper, ink, sage, rules, type
  styles/app.css               layout and components
  js/
    notes.js                   vault content: 26 notes with [[wikilinks]]
    icons.js                   the Lucide set the interface uses
    graph.js                   link graph, backlinks, edge list, rendering
    router.js                  the pane stack — the only navigation state
    session.js                 read marks, quiz answers, flagged cards, runs
    ask.js                     "ask Claude" — artifact runtime only, absent elsewhere
    mathify.js                 upright/italic typesetting for the maths runs
    plots.js                   canvas helpers and the two charts
    main.js                    wiring
    ui/                        panes, explorer, palette, graph view, hover peek
    tools/                     the sixteen interactive widgets, today.js included
    sim/                       rng.js, linalg.js, gmm.js  ← the JS estimator
    snippets.generated.js      built by tools/snippets.mjs — do not edit
reference/
  js/cli.mjs                   Monte Carlo driver over src/js/sim/gmm.js
  cpp/                         C++17 port + Makefile
  csharp/DynamicPanel/         .NET 8 port
  stata/dynamic_panel.do       what you would actually run on data
  r/dynamic_panel.R
tools/                         bundler, snippets, crosscheck, dev server
tests/                         node:test suites
dist/                          build output (gitignored)
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
npm test              # 28 tests: the estimators, the link graph, the snippets
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

The app opens on **Today**; the reading order starts at **Start here**, and the graph view shows
how the notes connect.
