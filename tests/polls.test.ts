import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rulesSchema,
  validateAnswer,
  results,
  maySeeResults,
  type Poll,
} from "../packages/polls/src/index.js";
const rules = rulesSchema.parse({
  type: "single",
  options: ["A", "B", "C"],
  visibility: "after_vote",
  participation: "anonymous",
});
test("Single-Choice rejects empty, duplicate, out-of-range and fractional answers", () => {
  for (const input of [[], [0, 1], [0, 0], [3], [-1], [0.5], null, "0"])
    assert.throws(() => validateAnswer(rules, input));
  assert.deepEqual(validateAnswer(rules, [0]), [0]);
});
test("Multiple-choice enforces configurable bounds and counts participants as denominator", () => {
  const r = {
    ...rules,
    type: "multiple" as const,
    minChoices: 1,
    maxChoices: 2,
  };
  assert.throws(() => validateAnswer(r, []));
  assert.throws(() => validateAnswer(r, [0, 1, 2]));
  const out = results(r, [[0, 1], [0]]);
  assert.equal(out.total, 2);
  assert.equal(out.items[0]?.percent, 100);
  assert.equal(out.items[1]?.percent, 50);
});
test("Ranking requires a complete permutation and computes Borda scores", () => {
  const r = { ...rules, type: "ranking" as const };
  assert.throws(() => validateAnswer(r, [0, 1]));
  assert.throws(() => validateAnswer(r, [0, 0, 2]));
  const out = results(r, [
    [0, 1, 2],
    [1, 2, 0],
  ]);
  assert.deepEqual(
    out.items.map((i) => i.score),
    [2, 3, 1],
  );
  assert.equal(out.items[1]?.percent, 75);
});
test("Tie and quorum do not silently imply an accepted decision", () => {
  const out = results({ ...rules, quorum: 3, tieRule: "runoff" }, [[0], [1]]);
  assert.equal(out.tie, true);
  assert.equal(out.runoffRequired, true);
  assert.equal(out.quorumReached, false);
  assert.equal(results(rules, []).tie, false);
});
test("Free text validates and never exposes unmoderated contributions in public result", () => {
  const r = { ...rules, type: "text" as const, options: [] };
  assert.throws(() => validateAnswer(r, "  "));
  assert.equal(validateAnswer(r, " Idee "), "Idee");
  assert.deepEqual(results(r, ["private idea"]).items, []);
});
test("All visibility modes enforce their release condition", () => {
  const p: Poll = {
    id: "x",
    title: "x",
    description: "",
    rules,
    startsAt: "",
    endsAt: "",
    status: "active",
    released: false,
  };
  assert.equal(maySeeResults(p, false), false);
  assert.equal(maySeeResults(p, true), true);
  assert.equal(
    maySeeResults(
      { ...p, rules: { ...rules, visibility: "hidden" }, released: true },
      true,
    ),
    false,
  );
  assert.equal(
    maySeeResults(
      { ...p, rules: { ...rules, visibility: "after_close" } },
      true,
    ),
    false,
  );
  assert.equal(
    maySeeResults(
      {
        ...p,
        status: "closed",
        rules: { ...rules, visibility: "after_close" },
      },
      false,
    ),
    true,
  );
  assert.equal(
    maySeeResults(
      { ...p, rules: { ...rules, visibility: "after_release" } },
      true,
    ),
    false,
  );
});
test("Invalid option sets and bounds fail before publication", () => {
  assert.throws(() => rulesSchema.parse({ ...rules, options: ["A", "A"] }));
  assert.throws(() =>
    rulesSchema.parse({ ...rules, minChoices: 2, maxChoices: 1 }),
  );
});
