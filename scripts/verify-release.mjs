import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(process.argv[2] ?? ".");
const env = {
  ...process.env, NODE_ENV: "development", TEST_MYSQL: "false", HOST: "127.0.0.1", PORT: "0",
  SITE_URL: "http://localhost", SESSION_SECRET: randomBytes(32).toString("hex"),
  LEGAL_IMPRINT_FILE: "docs/legal/impressum.txt", LEGAL_PRIVACY_FILE: "docs/legal/datenschutz.txt",
  LEGAL_CONTRIBUTION_FILE: "docs/legal/beitraege.txt", LEGAL_IMPRINT_TEXT: "", LEGAL_PRIVACY_TEXT: "",
  LEGAL_CONTRIBUTION_TERMS: "", LEGAL_REVIEWED: "false", STRIPE_SECRET_KEY: "", STRIPE_PUBLISHABLE_KEY: "",
};
const child = spawn(process.execPath, ["dist/apps/server/src/main.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
const exit = new Promise((done) => child.once("close", done));
try {
  const url = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("Release application did not start within 15 seconds")), 15000);
    let output = "";
    child.once("error", () => { clearTimeout(timer); fail(new Error("Release application could not start")); });
    child.once("exit", () => { clearTimeout(timer); fail(new Error("Release application exited before startup")); });
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-16000);
      const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
    // Error output is deliberately not printed: diagnostics can contain provider details.
    child.stderr.resume();
  });
  for (const path of ["/health", "/", "/assets/vendor/motion.js", "/impressum", "/datenschutz"]) {
    const response = await fetch(url + path, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, "Compiled release route unavailable: " + path);
    await response.arrayBuffer();
  }
  const legal = await (await fetch(url + "/api/legal", { signal: AbortSignal.timeout(5000) })).json();
  assert.equal(legal.reviewed, false);
  assert.match(legal.privacy, /pseudonymisiert/);
} finally {
  child.kill("SIGTERM");
  const fallback = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exit;
  clearTimeout(fallback);
}
const rejected = spawnSync(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: root, env: { ...env, NODE_ENV: "production", SITE_URL: "https://community.example.org" },
  encoding: "utf8", timeout: 10000,
});
assert.equal(rejected.error, undefined);
assert.notEqual(rejected.status, 0);
assert.match(rejected.stderr, /Produktionsstart blockiert/);
console.log("Release with production dependencies starts, serves assets/legal pages, and refuses unfinished production configuration.");
