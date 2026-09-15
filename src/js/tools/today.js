/**
 * The Today note: the hero, the daily planner, and the Pomodoro timer.
 *
 * All three are ordinary vault tools, so they sit inside a note pane like every
 * other one — the timer in particular is meant to read as part of the page, not
 * as a widget dropped on top of it.
 */

import { NOTES, escapeHtml } from '../graph.js';
import {
  session, addTask, toggleTask, removeTask, clearFinishedTasks,
  recordPomodoro, onSessionChange, isRead
} from '../session.js';
import { icon } from '../icons.js';
import { qs } from './dom.js';

/* --------------------------------------------------------------- hero ---- */

const GREETINGS = [
  [5, 'Good morning'],
  [12, 'Good afternoon'],
  [18, 'Good evening'],
  [22, 'Still up']
];

function greeting(hour) {
  let label = 'Good evening';
  for (const [from, text] of GREETINGS) if (hour >= from) label = text;
  if (hour < 5) label = 'Still up';
  return label;
}

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'long', day: 'numeric', month: 'long'
});

export function hero(slot) {
  const now = new Date();

  function render() {
    const read = NOTES.filter((note) => isRead(note.id)).length;
    const open = session.tasks.filter((task) => !task.done).length;
    const focus = session.pomodoro.completed;

    slot.innerHTML = `
      <header class="hero">
        <p class="eyebrow">${escapeHtml(greeting(now.getHours()))} · ${escapeHtml(LONG_DATE.format(now))}</p>
        <h1>Focus deeply.<br><em>Learn beautifully.</em></h1>
        <p class="sub">Twenty-six notes on dynamic panel estimation, a simulation lab that runs the
          estimators live, and a quiet place to work through them one session at a time.</p>
        <div class="facts">
          <div class="fact"><div class="n">${read} / ${NOTES.length}</div><div class="l">Notes read</div></div>
          <div class="fact"><div class="n">${open}</div><div class="l">Open task${open === 1 ? '' : 's'}</div></div>
          <div class="fact"><div class="n">${focus}</div><div class="l">Focus block${focus === 1 ? '' : 's'} today</div></div>
        </div>
      </header>`;
  }

  onSessionChange(() => { if (slot.isConnected) render(); });
  render();
}

/* ------------------------------------------------------------ planner ---- */

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function planner(slot) {
  slot.innerHTML = `
    <section class="planner">
      <div class="planner-head">
        <h2>Today's plan</h2>
        <span class="count" data-count></span>
      </div>
      <ul class="task-list" data-list></ul>
      <p class="planner-empty" data-empty hidden>Nothing planned yet. What is the one thing worth
        finishing today?</p>
      <form class="task-add" data-add>
        <label class="offscreen" for="task-input">Add a task</label>
        <input id="task-input" type="text" autocomplete="off" maxlength="180"
               placeholder="Add a task — read Nickell bias, run the lab at rho = 0.9…">
        <button type="submit" class="btn" data-icon="plus">Add</button>
      </form>
      <div class="ctl"><button class="btn" data-clear hidden>Clear finished</button></div>
    </section>`;

  const $ = qs(slot);
  const list = $('[data-list]');

  function render() {
    const tasks = session.tasks;
    const done = tasks.filter((t) => t.done).length;

    list.innerHTML = tasks.map((task) => `
      <li class="task${task.done ? ' done' : ''}" data-task="${escapeHtml(task.id)}">
        <button class="task-check" data-toggle aria-pressed="${task.done}"
                aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button>
        <span class="task-text">${escapeHtml(task.text)}</span>
        ${task.done && task.completedAt
    ? `<span class="task-time">${escapeHtml(CLOCK.format(new Date(task.completedAt)))}</span>`
    : ''}
        <button class="task-drop" data-remove aria-label="Remove task">${icon('x')}</button>
      </li>`).join('');

    $('[data-empty]').hidden = tasks.length > 0;
    $('[data-count]').textContent = tasks.length ? `${done} of ${tasks.length} done` : '';
    $('[data-clear]').hidden = done === 0;
  }

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-task]');
    if (!item) return;
    const id = item.dataset.task;
    if (event.target.closest('[data-toggle]')) toggleTask(id);
    else if (event.target.closest('[data-remove]')) removeTask(id);
  });

  $('[data-add]').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#task-input');
    if (addTask(input.value)) input.value = '';
    input.focus();
  });

  $('[data-clear]').onclick = clearFinishedTasks;

  onSessionChange(() => { if (slot.isConnected) render(); });
  render();
}

/* ----------------------------------------------------------- pomodoro ---- */

const PHASES = {
  focus: { label: 'Focus', minutes: 25, next: 'break' },
  break: { label: 'Short break', minutes: 5, next: 'focus' },
  long: { label: 'Long break', minutes: 15, next: 'focus' }
};

const ROUNDS_BEFORE_LONG = 4;
const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function pomodoro(slot) {
  let phase = 'focus';
  let remaining = PHASES.focus.minutes * 60;
  let running = false;
  let ticker = null;
  let roundsThisCycle = 0;

  slot.innerHTML = `
    <section class="pomo">
      <div class="pomo-dial">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle class="pomo-track" cx="64" cy="64" r="${RADIUS}"></circle>
          <circle class="pomo-sweep" cx="64" cy="64" r="${RADIUS}"
                  stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}"
                  stroke-dashoffset="0" data-sweep></circle>
        </svg>
        <div class="pomo-readout">
          <div class="pomo-time" data-time role="timer" aria-live="off">25:00</div>
          <div class="pomo-phase" data-phase>Focus</div>
        </div>
      </div>
      <div class="pomo-side">
        <h3>Pomodoro</h3>
        <p class="hint" data-say>Twenty-five minutes of work, then five away from the screen.</p>
        <div class="ctl tight">
          <button class="btn pri" data-start data-icon="play">Start</button>
          <button class="btn" data-reset data-icon="rotate-ccw">Reset</button>
          <button class="btn" data-skip>Skip</button>
        </div>
        <div class="pomo-rounds" data-rounds></div>
      </div>
    </section>`;

  const $ = qs(slot);
  const root = $('.pomo');
  const sweep = $('[data-sweep]');

  const clock = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  function paint() {
    const total = PHASES[phase].minutes * 60;
    const elapsed = 1 - remaining / total;
    sweep.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * elapsed).toFixed(2));
    $('[data-time]').textContent = clock(remaining);
    $('[data-phase]').textContent = PHASES[phase].label;
    root.classList.toggle('running', running);

    const startButton = $('[data-start]');
    startButton.innerHTML = `${icon(running ? 'pause' : 'play')}${running ? 'Pause' : 'Start'}`;

    const completed = session.pomodoro.completed;
    $('[data-rounds]').innerHTML =
      Array.from({ length: ROUNDS_BEFORE_LONG }, (_, i) =>
        `<span class="pip${i < roundsThisCycle ? ' on' : ''}"></span>`).join('')
      + `<span class="lbl">${completed} today</span>`;
  }

  function stop() {
    running = false;
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  function moveTo(next) {
    stop();
    phase = next;
    remaining = PHASES[next].minutes * 60;
    paint();
  }

  function finish() {
    stop();
    if (phase === 'focus') {
      recordPomodoro();
      roundsThisCycle += 1;
      const longBreak = roundsThisCycle >= ROUNDS_BEFORE_LONG;
      if (longBreak) roundsThisCycle = 0;
      $('[data-say]').textContent = longBreak
        ? 'Four blocks done. Take the long break — fifteen minutes, properly away.'
        : 'Block finished. Five minutes away from the screen, then go again.';
      moveTo(longBreak ? 'long' : 'break');
    } else {
      $('[data-say]').textContent = 'Break over. Pick the next task and start the clock.';
      moveTo('focus');
    }
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      finish();
      return;
    }
    paint();
  }

  $('[data-start]').onclick = () => {
    if (running) {
      stop();
      $('[data-say]').textContent = 'Paused. The clock picks up where you left it.';
    } else {
      running = true;
      ticker = setInterval(tick, 1000);
      $('[data-say]').textContent = phase === 'focus'
        ? 'Running. One task, nothing else, until the dial closes.'
        : 'Break running. Stand up, look at something far away.';
    }
    paint();
  };

  $('[data-reset]').onclick = () => {
    moveTo(phase);
    $('[data-say]').textContent = 'Reset. Start when you are ready.';
  };

  $('[data-skip]').onclick = () => {
    moveTo(PHASES[phase].next === 'break' && roundsThisCycle >= ROUNDS_BEFORE_LONG
      ? 'long'
      : PHASES[phase].next);
    $('[data-say]').textContent = 'Skipped ahead.';
  };

  // An interval outlives the pane that owns it, so stop when the node goes.
  const observer = new MutationObserver(() => {
    if (!slot.isConnected) {
      stop();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  onSessionChange(() => { if (slot.isConnected) paint(); });
  paint();
}
