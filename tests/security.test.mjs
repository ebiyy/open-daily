import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { ROOT, loadData, renderIndex, serializePageData } from "../scripts/lib/project.mjs";

test("HTML delimiters in notes stay inside JSON and round-trip without alteration", () => {
  const note = '</ScRiPt ><img src="/probe" onerror="void 0"> <!-- <script> & " \\ \u2028\u2029';
  const data = JSON.parse(JSON.stringify(loadData()));
  const day = Object.keys(data.LOGS)[0];
  data.LOGS[day][0].note = note;
  data.CONDITIONS[day][0].text = note;

  const encoded = serializePageData(data);
  assert.equal(encoded.includes("<"), false);
  assert.equal(encoded.includes("\u2028"), false);
  assert.equal(encoded.includes("\u2029"), false);
  assert.deepEqual(JSON.parse(encoded), data);

  const html = renderIndex(data);
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal(blocks.length, 2, "a note must not introduce or terminate a script block");
  assert.match(blocks[0][1], /type="application\/json"/);
  assert.equal(blocks[1][1], "", "only the application block is executable");
  assert.deepEqual(JSON.parse(blocks[0][2]), data);
  assert.equal(html.includes('<img src="/probe"'), false);
});

test("CSP authorizes the exact app and stylesheet and denies extra active content", () => {
  const html = renderIndex();
  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(match);
  assert.ok(match.index < html.indexOf("<style>"));
  assert.ok(match.index < html.indexOf("<script"));
  const directives = new Map(match[1].split(";").map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  const hash = (source) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
  const app = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.deepEqual(directives.get("script-src"), [hash(app)]);
  assert.deepEqual(directives.get("style-src"), [hash(style)]);
  assert.notEqual(hash(app + "\nvoid 0;"), directives.get("script-src")[0]);
  for (const name of [
    "default-src", "connect-src", "object-src", "base-uri", "form-action",
    "script-src-attr", "style-src-attr",
  ]) {
    assert.deepEqual(directives.get(name), ["'none'"], name);
  }
  assert.deepEqual(directives.get("img-src"), ["data:"]);
  assert.doesNotMatch(match[1], /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("malformed data produces a visible error and is never evaluated as JavaScript", () => {
  const app = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");
  for (const source of ["{", "null", "(globalThis.executionMarker = 1, {})"]) {
    const banners = [];
    const context = vm.createContext({
      executionMarker: 0,
      document: {
        getElementById: () => ({ textContent: source }),
        createElement: () => ({}),
        body: { prepend: (element) => banners.push(element) },
      },
    });
    assert.throws(() => new vm.Script(app).runInContext(context), /data failed to load/);
    assert.equal(context.executionMarker, 0);
    assert.equal(banners.length, 1);
    assert.match(banners[0].textContent, /データを読み込めません/);
  }
});
