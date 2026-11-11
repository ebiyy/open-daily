import test from "node:test";
import assert from "node:assert/strict";
import { renderIndex } from "../scripts/lib/project.mjs";
import { fetchPublishedHtml, verifyPublishedHtml } from "../scripts/check-published.mjs";

test("published check accepts the expected preview and rejects stale or injected content", () => {
  const expected = renderIndex();
  assert.doesNotThrow(() => verifyPublishedHtml(expected, expected));
  for (const actual of ["<html>Not found</html>", expected + "<script>void 0;</script>"]) {
    assert.throws(() => verifyPublishedHtml(actual, expected), /differs/);
  }
});

test("published check rejects missing or weakened CSP even if the expected snapshot agrees", () => {
  const expected = renderIndex();
  const missing = expected.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, "");
  assert.throws(() => verifyPublishedHtml(missing, missing), /no CSP/);
  const weakened = expected.replace("connect-src 'none'", "connect-src *");
  assert.throws(() => verifyPublishedHtml(weakened, weakened), /Unsafe CSP/);
});

test("published fetch requires HTTPS, a successful HTML response and no redirect following", async () => {
  const url = "https://example.invalid/preview/";
  const html = "<!doctype html><title>Fictional preview</title>";
  const actual = await fetchPublishedHtml(url, async (target, options) => {
    assert.equal(target.href, url);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  assert.equal(actual, html);
  await assert.rejects(fetchPublishedHtml("http://example.invalid/", () => assert.fail("must not fetch HTTP")), /HTTPS/);
  await assert.rejects(fetchPublishedHtml(url, async () => new Response("Not found", { status: 404 })), /HTTP 404/);
  await assert.rejects(fetchPublishedHtml(url, async () => new Response("{}", { headers: { "content-type": "application/json" } })), /text/);
  await assert.rejects(fetchPublishedHtml(url, async () => new Response(null, { status: 302 })), /HTTP 302/);
});
