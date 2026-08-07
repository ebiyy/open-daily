#!/usr/bin/env node
import { validateProject } from "./lib/validation.mjs";

const result = validateProject();
if (result.errors.length) {
  console.error(`validation failed (${result.errors.length})`);
  console.error(result.errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const summary = result.summary;
console.log(
  `validation OK: ${summary.logDays} days, ${summary.entries} entries, ` +
  `${summary.conditions} conditions, ${summary.decisions} decisions, ` +
  `${summary.harvests} harvest, ${summary.stumbles} stumble, ` +
  `${summary.narratives} narrative, ${summary.monthlyGoals} goal, ` +
  `${summary.agendas} agenda, ${summary.rewards} reward, ` +
  `${summary.rewardSettlements} settlement`,
);
