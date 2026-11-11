import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadData, outputPath, renderIndex } from "../scripts/lib/project.mjs";
import { parseMinutes, validateProject } from "../scripts/lib/validation.mjs";

test("fictional sample satisfies every Evidence Primitive invariant", () => {
  const result = validateProject();
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.logDays, 3);
  assert.ok(result.summary.entries > 20, "timeline should read as lived days, not a feature catalog");
  for (const key of [
    "conditions", "decisions", "harvests", "stumbles", "narratives",
    "monthlyGoals", "agendas", "rewards", "rewardSettlements",
  ]) {
    assert.ok(result.summary[key] >= 1, `${key} must appear in the sample`);
  }
});

test("sample is a consecutive three-day recovery story", () => {
  const data = loadData();
  const days = Object.keys(data.LOGS).sort();
  assert.deepEqual(Array.from(days), ["2099-04-14", "2099-04-15", "2099-04-16"]);
  const timestamps = days.map((day) => Date.parse(`${day}T00:00:00Z`));
  assert.equal(timestamps[1] - timestamps[0], 86_400_000);
  assert.equal(timestamps[2] - timestamps[1], 86_400_000);

  assert.ok(data.STUMBLES[0].refs.some((ref) => ref.includes("2099-04-14")));
  assert.ok(Object.values(data.CONDITIONS).flat().some((item) => item.kind === "decision"));
  assert.ok(data.HARVESTS[0].refs.some((ref) => ref.includes("2099-04-16")));
  assert.equal(data.NARRATIVES[0].refs.length, 3);
});

test("all refs resolve to unique, real log titles", () => {
  const data = loadData();
  const titleCounts = new Map();
  for (const [date, entries] of Object.entries(data.LOGS)) {
    for (const entry of entries) {
      const key = `${date} ${entry.title}`;
      titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    }
  }

  const records = [
    ...Object.values(data.CONDITIONS).flat(),
    ...data.HARVESTS,
    ...data.STUMBLES,
    ...data.NARRATIVES,
    ...data.MONTHLY_GOALS,
    ...data.AGENDAS,
    ...data.REWARDS,
  ];
  for (const record of records) {
    for (const ref of record.refs) assert.equal(titleCounts.get(ref), 1, ref);
  }
});

test("reward settlement consumes one completed experience once", () => {
  const data = loadData();
  const consumed = data.REWARDS.filter((item) => item.consumedAt != null);
  const settled = data.REWARD_SETTLEMENTS.flatMap((item) => Array.from(item.rewards));
  assert.equal(consumed.length, 1);
  assert.equal(settled.length, 1);
  assert.equal(new Set(settled).size, settled.length);
  assert.equal(settled.length * 500, 500);
  assert.equal(settled[0], consumed[0].title);
});

test("extended time parsing is strict", () => {
  assert.equal(parseMinutes("25:30"), 1530);
  assert.equal(parseMinutes("09:05"), 545);
  assert.equal(parseMinutes("09:60"), null);
  assert.equal(parseMinutes("9:5"), null);
});

test("generated index is deterministic, current, and standalone", () => {
  const rendered = renderIndex();
  assert.equal(rendered, renderIndex());
  assert.equal(fs.readFileSync(outputPath(), "utf8"), rendered);
  assert.equal(rendered.includes("__OPEN_DAILY_"), false);
  assert.equal((rendered.match(/<script\b/g) || []).length, 2);
  assert.equal((rendered.match(/<script>/g) || []).length, 1);
  assert.match(rendered, /<script type="application\/json" id="open-daily-data">/);
  assert.equal(/(?:src|href)=["']https?:\/\//i.test(rendered), false);
  assert.match(rendered, /<details class="logs card" open>/);
  assert.match(rendered, /時間の証左/);
  assert.match(rendered, /Talk your day\. Keep the evidence\./);
});
