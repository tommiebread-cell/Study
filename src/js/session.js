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
  runs: []
};

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
      runs: session.runs
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
  } catch {
    // Corrupt payload from an older build: start clean rather than half-loaded.
  }
}
