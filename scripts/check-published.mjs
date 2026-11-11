import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export function verifyPublishedHtml(actual, expected) {
  assert.equal(actual, expected, "Published HTML differs from the last successful deployment");
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(actual);
  assert.ok(policy, "Published HTML has no CSP");
  const directives = new Map(policy[1].split(";").map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  for (const name of ["default-src", "connect-src", "object-src", "base-uri", "form-action", "script-src-attr", "style-src-attr"]) {
    assert.deepEqual(directives.get(name), ["'none'"], `Unsafe CSP directive: ${name}`);
  }
  for (const name of ["script-src", "style-src"]) {
    assert.equal(directives.get(name)?.length, 1, `Expected one hash in ${name}`);
    assert.match(directives.get(name)[0], /^'sha256-[A-Za-z0-9+/]{43}='$/);
  }
}

export async function fetchPublishedHtml(url, fetchImpl = fetch) {
  const target = new URL(url);
  assert.equal(target.protocol, "https:", "Published preview must use HTTPS");
  assert.ok(!target.username && !target.password, "Published preview must not require credentials");
  const response = await fetchImpl(target, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { "Cache-Control": "no-cache" },
  });
  assert.equal(response.status, 200, `Published preview returned HTTP ${response.status}`);
  assert.match(response.headers.get("content-type") || "", /^text\/html(?:;|$)/i);
  return response.text();
}

async function main() {
  const [url, expectedPath] = process.argv.slice(2);
  assert.ok(url && expectedPath, "Usage: node scripts/check-published.mjs HTTPS_URL EXPECTED_HTML");
  const expected = await fs.readFile(expectedPath, "utf8");
  // Retry transient network errors and Pages CDN propagation before alerting.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      verifyPublishedHtml(await fetchPublishedHtml(url), expected);
      console.log("Published preview: HTTPS, HTML and CSP checks passed.");
      return;
    } catch (error) {
      // Never dump the HTML body or response headers into the CI logs.
      console.error(`Published preview check ${attempt}/4: ${error.message.split("\n")[0]}`);
      if (attempt === 4) throw new Error("Published preview check failed after retries");
      await delay(20_000);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
