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
async function verifyRuntime(runtimeEnv, production) {
const child = spawn(process.execPath, ["dist/apps/server/src/main.js"], { cwd: root, env: runtimeEnv, stdio: ["ignore", "pipe", "pipe"] });
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
  assert.equal(legal.reviewed, production);
  if (!production) assert.match(legal.privacy, /pseudonymisiert/);
  else {
    const poll = await fetch(url + "/api/poll", { signal: AbortSignal.timeout(5000) });
    assert.equal(poll.status, 200);
    assert.match(poll.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(poll.headers.get("set-cookie") ?? "", /Secure/i);
    assert.match(poll.headers.get("set-cookie") ?? "", /SameSite=Strict/i);
    assert.equal(poll.headers.get("cache-control"), "no-store");
    assert.match(poll.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    const admin = await fetch(url + "/api/admin/dashboard", { signal: AbortSignal.timeout(5000) });
    assert.equal(admin.status, 401);
    const write = await fetch(url + "/api/participation/request", {
      method: "POST", headers: { origin: "https://untrusted.example.invalid", "content-type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(5000),
    });
    assert.equal(write.status, 403);
  }
} finally {
  child.kill("SIGTERM");
  const fallback = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exit;
  clearTimeout(fallback);
}
}
await verifyRuntime(env, false);
const rejected = spawnSync(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: root, env: { ...env, NODE_ENV: "production", SITE_URL: "https://community.example.org" },
  encoding: "utf8", timeout: 10000,
});
assert.equal(rejected.error, undefined);
assert.notEqual(rejected.status, 0);
assert.match(rejected.stderr, /Produktionsstart blockiert/);
// Synthetic fixtures only: never operator facts or a legal production approval.
await verifyRuntime({
  ...env, NODE_ENV: "production", SITE_URL: "https://community.example.org", DEMO_MODE: "false",
  LEGAL_IMPRINT_FILE: "", LEGAL_PRIVACY_FILE: "", LEGAL_CONTRIBUTION_FILE: "",
  OPERATOR_NAME: "Synthetic CI operator", OPERATOR_ADDRESS: "Synthetic CI address",
  OPERATOR_EMAIL: "ci@example.invalid", LEGAL_REVIEWED: "true", RAW_VOTE_RETENTION_DAYS: "90",
  LEGAL_IMPRINT_TEXT: "Synthetic CI legal fixture; not intended for publication.",
  LEGAL_PRIVACY_TEXT: "Synthetic CI privacy fixture; not intended for publication.",
  LEGAL_CONTRIBUTION_TERMS: "Synthetic CI contribution fixture; not intended for publication.",
}, true);
console.log("Compiled release verified in development and production modes: assets/legal pages, secure cookies, protected administration, origin checks and rejection of unfinished configuration.");
