/**
 * What you have done in the vault: notes read, quiz answers, flagged cards,
 * simulation runs. Persisted to localStorage so the review queue survives a
 * reload, and defensive about it — private browsing throws on access.
 */

const KEY = 'gmm-vault/session/v1';

const listeners = new Set();

export const session = {
  read: new Set(),
  quiz: {},
  cards: new Set(),
  runs: [],
  tasks: [],
  pomodoro: { completed: 0, date: today() }
};

/** Local calendar day, so the planner rolls over at the reader's midnight. */
export function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function notify() {
  for (const fn of listeners) fn(session);
  save();
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isRead = (id) => session.read.has(id);

export function toggleRead(id) {
  if (session.read.has(id)) session.read.delete(id);
  else session.read.add(id);
  notify();
  return session.read.has(id);
}

export function markRead(id) {
  session.read.add(id);
  notify();
}

export function clearRead() {
  session.read.clear();
  notify();
}

export function recordAnswer(questionIndex, record) {
  session.quiz[questionIndex] = record;
  notify();
}

export function flagCard(prompt) {
  session.cards.add(prompt);
  notify();
}

export function unflagCard(prompt) {
  session.cards.delete(prompt);
  notify();
}

export function recordRun(run) {
  session.runs.push(run);
  if (session.runs.length > 40) session.runs.splice(0, session.runs.length - 40);
  notify();
}

export function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const task = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: trimmed.slice(0, 180),
    done: false,
    added: Date.now()
  };
  session.tasks.push(task);
  notify();
  return task;
}

export function toggleTask(id) {
  const task = session.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : undefined;
  notify();
}

export function removeTask(id) {
  const index = session.tasks.findIndex((t) => t.id === id);
  if (index === -1) return;
  session.tasks.splice(index, 1);
  notify();
}

export function clearFinishedTasks() {
  session.tasks = session.tasks.filter((t) => !t.done);
  notify();
}

/** Count a finished focus block, resetting the tally on a new day. */
export function recordPomodoro() {
  const stamp = today();
  if (session.pomodoro.date !== stamp) session.pomodoro = { completed: 0, date: stamp };
  session.pomodoro.completed += 1;
  notify();
}

export function clearProgress() {
  session.quiz = {};
  session.cards.clear();
  session.runs.length = 0;
  notify();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      read: [...session.read],
      quiz: session.quiz,
      cards: [...session.cards],
      runs: session.runs,
      tasks: session.tasks,
      pomodoro: session.pomodoro
    }));
  } catch {
    // Private mode, blocked storage, quota. The session still works in memory.
  }
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.read)) session.read = new Set(saved.read);
    if (saved.quiz && typeof saved.quiz === 'object') session.quiz = saved.quiz;
    if (Array.isArray(saved.cards)) session.cards = new Set(saved.cards);
    if (Array.isArray(saved.runs)) session.runs = saved.runs;
    if (Array.isArray(saved.tasks)) session.tasks = saved.tasks.filter((t) => t && typeof t.text === 'string');
    if (saved.pomodoro && typeof saved.pomodoro.completed === 'number') {
      // A tally from an earlier day is history, not today's count.
      session.pomodoro = saved.pomodoro.date === today()
        ? saved.pomodoro
        : { completed: 0, date: today() };
    }
  } catch {
    // Corrupt payload from an older build: start clean rather than half-loaded.
  }
}
