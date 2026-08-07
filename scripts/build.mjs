#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { outputPath, renderIndex } from "./lib/project.mjs";
import { validateProject } from "./lib/validation.mjs";

const checkOnly = process.argv.includes("--check");
const result = validateProject();
if (result.errors.length) {
  console.error(result.errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const rendered = renderIndex();
const target = outputPath();
if (checkOnly) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== rendered) {
    console.error(`${path.relative(process.cwd(), target)} が正本と一致しません。npm run build を実行してください`);
    process.exit(1);
  }
  console.log("index.html is up to date");
} else {
  fs.writeFileSync(target, rendered);
  console.log(`built ${path.relative(process.cwd(), target)}`);
}
