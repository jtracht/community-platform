import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertTestDatabase } from "../packages/database/testing.js";
import { pool, rows, transaction, lockState } from "../packages/database/index.js";
import { createPoll, changePoll } from "../apps/server/src/service.js";
import { loadLegalContent } from "../apps/server/src/legal-content.js";
import { buildApp } from "../apps/server/src/app.js";

const enabled = process.env.TEST_MYSQL === "true";
if (enabled) assertTestDatabase();
after(async () => { await pool.end(); });

test("Text votes retain exactly the displayed file-based contribution terms, including after file changes", { skip: !enabled }, async () => {
  process.env.SITE_URL = "http://localhost:3000";
  const guard = await pool.getConnection();
  await guard.query("SELECT GET_LOCK('community-test-suites',60)");
  const directory = await mkdtemp(join(tmpdir(), "community-consent-"));
  const file = join(directory, "terms.txt");
  const actor = randomUUID();
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let pollId: string | undefined;
  try {
    for (const p of await rows<{ id: string }>("SELECT id FROM polls WHERE status IN ('active','scheduled')"))
      await changePoll(p.id, "close", actor);
    await transaction(async (c) => {
      await lockState(c);
      await c.execute("UPDATE platform_state SET paused=FALSE WHERE id=1");
      await c.execute("UPDATE modules SET enabled=TRUE,version='1.0.0' WHERE id='polls'");
    });
    await writeFile(file, "Beitragsbedingungen Fassung A – {{OPERATOR_NAME}}.");
    const legal = await loadLegalContent({ OPERATOR_NAME: "Testbetreiber", LEGAL_CONTRIBUTION_FILE: file });
    app = await buildApp(legal);
    pollId = await createPoll({
      title: "Contribution version regression", description: "",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 600000).toISOString(),
      rules: { type: "text", options: [], participation: "anonymous", visibility: "hidden" },
    }, actor);
    await changePoll(pollId, "schedule", actor);
    await writeFile(file, "Geänderte Fassung B, erst nach Neustart wirksam.");
    assert.equal((await app.inject("/api/legal")).json().contributions, legal.contributions);
    const submit = (accepted: boolean) => app!.inject({
      method: "POST", url: `/api/poll/${pollId}/vote`,
      headers: { origin: process.env.SITE_URL ?? "http://localhost:3000", cookie: "voter=" + randomUUID() },
      payload: { answer: "Ein neuer Vorschlag", termsAccepted: accepted },
    });
    assert.equal((await submit(false)).statusCode, 400);
    const response = await submit(true);
    assert.equal(response.statusCode, 200, response.body);
    const stored = await rows<{ contribution_terms_hash: string; content: string }>(
      "SELECT v.contribution_terms_hash,l.content FROM votes v JOIN legal_versions l ON l.hash=v.contribution_terms_hash WHERE v.poll_id=?", [pollId],
    );
    assert.equal(stored.length, 1);
    assert.equal(stored[0]!.content, legal.contributions);
    assert.equal(stored[0]!.contribution_terms_hash, createHash("sha256").update(legal.contributions).digest("hex"));
    assert.notEqual(stored[0]!.content, (await loadLegalContent({ LEGAL_CONTRIBUTION_FILE: file })).contributions);
  } finally {
    if (pollId) await changePoll(pollId, "close", actor);
    await app?.close();
    await unlink(file).catch(() => {});
    await rmdir(directory);
    await guard.query("SELECT RELEASE_LOCK('community-test-suites')");
    guard.release();
  }
});
