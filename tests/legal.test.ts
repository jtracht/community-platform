import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLegalContent, assertProductionLegalContent } from "../apps/server/src/legal-content.js";
import { buildApp } from "../apps/server/src/app.js";

const operator = {
  OPERATOR_NAME: "Betreiber <Test>",
  OPERATOR_ADDRESS: "Testanschrift 1\n12345 Testort",
  OPERATOR_EMAIL: "test@example.invalid",
};

test("Legal documents load from explicit files, substitute only operator facts and reject invalid configuration", async () => {
  const draft = await loadLegalContent({
    ...operator,
    LEGAL_IMPRINT_FILE: "docs/legal/impressum.txt",
    LEGAL_PRIVACY_FILE: "docs/legal/datenschutz.txt",
    LEGAL_CONTRIBUTION_FILE: "docs/legal/beitraege.txt",
  });
  assert.match(draft.imprint, /Betreiber <Test>/);
  assert.match(draft.privacy, /pseudonymisiert/);
  assert.match(draft.privacy, /Stripe/);
  assert.match(draft.contributions, /nicht ausschließlich/);
  assert.ok(!draft.privacy.includes("{{OPERATOR_EMAIL}}"));
  assert.equal(draft.reviewed, false);
  assert.equal(Object.isFrozen(draft), true);
  assert.throws(() => assertProductionLegalContent({ ...draft, reviewed: true }), /blockiert/);
  const missing = await loadLegalContent({ LEGAL_IMPRINT_TEXT: "{{OPERATOR_ADDRESS}}\n{{SESSION_SECRET}}" });
  assert.equal(missing.imprint, "[ERGÄNZEN: OPERATOR_ADDRESS]\n{{SESSION_SECRET}}");
  await assert.rejects(loadLegalContent({ LEGAL_PRIVACY_FILE: "docs/legal/datenschutz.txt", LEGAL_PRIVACY_TEXT: "Conflicting text" }), /nicht gleichzeitig/);
  const directory = await mkdtemp(join(tmpdir(), "community-legal-"));
  try {
    const empty = join(directory, "empty.txt");
    await writeFile(empty, "   ");
    for (const file of [empty, directory, join(directory, "missing.txt")])
      await assert.rejects(loadLegalContent({ LEGAL_PRIVACY_FILE: file }), /nicht lesbar/);
    const oversized = join(directory, "oversized.txt");
    await writeFile(oversized, "x".repeat(262145));
    await assert.rejects(loadLegalContent({ LEGAL_PRIVACY_FILE: oversized }), /256 KiB/);
  } finally {
    await rm(join(directory, "empty.txt"), { force: true });
    await rm(join(directory, "oversized.txt"), { force: true });
    await rmdir(directory);
  }
});

test("Production legal gate refuses drafts, missing facts and invalid contact even when review is flagged", async () => {
  const content = await loadLegalContent({
    ...operator,
    LEGAL_IMPRINT_TEXT: "Finale Betreiberinformationen",
    LEGAL_PRIVACY_TEXT: "Ausgefüllte Datenschutzerklärung",
    LEGAL_CONTRIBUTION_TERMS: "Ausgefüllte Beitragsbedingungen",
    LEGAL_REVIEWED: "true",
  });
  assert.doesNotThrow(() => assertProductionLegalContent(content));
  assert.throws(() => assertProductionLegalContent({ ...content, reviewed: false }), /blockiert/);
  assert.throws(() => assertProductionLegalContent({ ...content, email: "no-email" }), /blockiert/);
  for (const key of ["operator", "address", "email", "imprint", "privacy", "contributions"] as const)
    for (const unfinished of ["", "  ", "[ERGÄNZEN: Anschrift]", "{{UNKNOWN_FACT}}", "ENTWURF – noch offen", "DRAFT: pending"])
      assert.throws(() => assertProductionLegalContent({ ...content, [key]: unfinished }), /blockiert/);
});

test("Legal API and direct pages share configured documents and escape embedded HTML", async () => {
  const content = await loadLegalContent({
    ...operator,
    LEGAL_IMPRINT_TEXT: "{{OPERATOR_NAME}}\n\n1. Kontakt\n{{OPERATOR_EMAIL}}",
    LEGAL_PRIVACY_TEXT: '1. Datenschutz\n<script>alert("x")</script>',
    LEGAL_CONTRIBUTION_TERMS: "Eigene Beiträge",
  });
  const app = await buildApp(content);
  try {
    assert.deepEqual((await app.inject("/api/legal")).json(), content);
    const imprint = await app.inject("/impressum");
    assert.equal(imprint.statusCode, 200);
    assert.match(imprint.body, /Betreiber &lt;Test&gt;/);
    assert.match(imprint.body, /<h2>1\. Kontakt<\/h2>/);
    assert.match(imprint.body, /noindex,nofollow/);
    assert.match(imprint.body, /Noch nicht für den Livegang freigegeben/);
    const privacy = await app.inject("/datenschutz");
    assert.match(privacy.body, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.ok(!privacy.body.includes("<script>"));
    assert.match((await app.inject("/beitraege")).body, /Eigene Beiträge/);
  } finally {
    await app.close();
  }
});
