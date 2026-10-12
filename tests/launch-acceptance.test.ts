import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceTemplate, assessAcceptance } from "../packages/modules/launch-acceptance.js";

test("Manual acceptance requires complete evidence, package identity and final owner approval without exposing notes", () => {
  const commit = "a".repeat(40);
  const record = acceptanceTemplate("0.1.3");
  assert.equal(assessAcceptance(record, "0.1.3", commit).documentationComplete, false);
  record.sourceCommit = commit;
  const checkedAt = new Date(Date.parse(record.createdAt) + 1000).toISOString();
  const now = Date.parse(checkedAt) + 1000;
  for (const check of record.checks) Object.assign(check, {
    status: "passed", reviewer: "Test reviewer", checkedAt,
    evidence: ["private-evidence-reference"], notes: "private-note-never-output",
  });
  const report = assessAcceptance(record, "0.1.3", commit, now);
  assert.equal(report.documentationComplete, true);
  assert.equal(report.documented, 16);
  assert.ok(!JSON.stringify(report).includes("private-"));
  assert.equal(assessAcceptance(record, "0.1.2", commit, now).documentationComplete, false);
  assert.equal(assessAcceptance(record, "0.1.3", "b".repeat(40), now).documentationComplete, false);
  assert.equal(assessAcceptance(record, "0.1.3", undefined, now).documentationComplete, false);
  const original = structuredClone(record);
  for (const mutation of [
    { reviewer: " " }, { evidence: [] }, { evidence: [" "] }, { status: "failed" },
    { checkedAt: "invalid" }, { checkedAt: new Date(now + 1000).toISOString() },
    { checkedAt: new Date(Date.parse(record.createdAt) - 1000).toISOString() },
  ]) {
    const changed = structuredClone(original);
    Object.assign(changed.checks[0]!, mutation);
    assert.equal(assessAcceptance(changed, "0.1.3", commit, now).documentationComplete, false);
  }
  const earlyApproval = structuredClone(original);
  earlyApproval.checks.at(-1)!.checkedAt = record.createdAt;
  assert.equal(assessAcceptance(earlyApproval, "0.1.3", commit, now).documentationComplete, false);
  const duplicate = structuredClone(original);
  duplicate.checks[0]!.id = duplicate.checks[1]!.id;
  assert.throws(() => assessAcceptance(duplicate, "0.1.3", commit, now));
  assert.throws(() => assessAcceptance({ ...original, unknown: true }, "0.1.3", commit, now));
});
