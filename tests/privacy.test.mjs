import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ROOT } from "../scripts/lib/project.mjs";

function projectFiles(directory = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...projectFiles(target));
    else files.push(target);
  }
  return files;
}

test("public snapshot contains no local identity, work-service context, or old sample dates", () => {
  const forbidden = [
    ["ebi", "yy"].join(""),
    ["Sla", "ck"].join(""),
    ["Lin", "ear"].join(""),
    ["2026", "07"].join("-"),
    ["2026", "08"].join("-"),
    ["/", "Users", "/"].join(""),
    ["/", "home", "/"].join(""),
  ];
  for (const file of projectFiles()) {
    const source = fs.readFileSync(file, "utf8");
    for (const value of forbidden) {
      assert.equal(source.includes(value), false, `${path.relative(ROOT, file)} contains a forbidden value`);
    }
  }
});

test("public snapshot contains no obvious email, secret, or inherited commit identifier", () => {
  const patterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    new RegExp(["s", "k", "-[A-Za-z0-9]{20,}"].join("")),
    new RegExp(["A", "K", "I", "A", "[A-Z0-9]{16}"].join("")),
    /\b[0-9a-f]{40}\b/i,
  ];
  for (const file of projectFiles()) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
      assert.equal(pattern.test(source), false, `${path.relative(ROOT, file)} matches ${pattern}`);
    }
  }
});
