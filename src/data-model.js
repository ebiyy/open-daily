/* Evidence Primitives and display configuration.
   Operational rules live in AGENTS.md. Keep this file data-only so the build
   can embed it before the application script. */

const CONFIG = {
  dayStart: 8,
  dayEnd: 26,
  hourPx: 52,
  sampleMode: true,
};

const CATEGORIES = {
  dev:   { label: "開発", color: "var(--c-dev)" },
  write: { label: "執筆", color: "var(--c-write)" },
  learn: { label: "学習・調査", color: "var(--c-learn)" },
  life:  { label: "生活", color: "var(--c-life)" },
  ops:   { label: "運用・調整", color: "var(--c-ops)" },
  rest:  { label: "休息", color: "var(--c-rest)" },
};

function e(start, end, cat, title, note) {
  return { start, end, cat, title, note };
}

function c(text, ...refs) {
  return { text, refs, kind: "condition" };
}

function d(text, ...refs) {
  return { text, refs, kind: "decision" };
}

function h(date, text, ...refs) {
  return { date, text, refs };
}

function s(date, text, cost, ...refs) {
  return { date, text, cost, refs };
}

function n(date, title, text, ...refs) {
  return { date, title, text, refs };
}

function g(month, title, text, items, review, ...refs) {
  return { date: `${month}-01`, month, title, text, items, review, refs };
}

function a(date, text, ...refs) {
  return { date, text, refs };
}

function r(date, title, labels, text, consumedAt, ...refs) {
  return { date, title, labels, text, consumedAt, refs };
}

function rs(date, settledAt, title, rewards, text) {
  return { date, settledAt, title, rewards, text };
}
