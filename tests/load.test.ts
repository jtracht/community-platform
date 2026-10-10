import { assertTestDatabase } from "../packages/database/testing.js";
if (process.env.TEST_MYSQL === "true") assertTestDatabase();
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, rows } from "../packages/database/index.js";
import {
  createPoll,
  changePoll,
  aggregate,
} from "../apps/server/src/service.js";
import { toPoll } from "../packages/database/index.js";
import { buildApp } from "../apps/server/src/app.js";
const enabled = process.env.TEST_MYSQL === "true";
after(async () => {
  await pool.end();
});
test(
  "100 parallel API voters produce exactly 100 correctly counted votes",
  { skip: !enabled },
  async () => {
    process.env.SITE_URL = "http://localhost:3000";
    const actor = randomUUID();
    const id = await createPoll(
      {
        title: "Concurrent API load test",
        description: "",
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
        rules: {
          type: "single",
          options: ["A", "B"],
          visibility: "hidden",
          participation: "anonymous",
        },
      },
      actor,
    );
    await changePoll(id, "schedule", actor);
    const app = await buildApp();
    try {
      const start = performance.now();
      const responses = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          app.inject({
            method: "POST",
            url: "/api/poll/" + id + "/vote",
            remoteAddress: "198.51.100." + (i + 1),
            headers: {
              origin: process.env.SITE_URL,
              cookie: "voter=" + randomUUID(),
            },
            payload: { answer: [i % 2] },
          }),
        ),
      );
      assert.equal(responses.filter((r) => r.statusCode === 200).length, 100);
      const p = toPoll(
        (await rows("SELECT * FROM polls WHERE id=?", [id]))[0]!,
      );
      const result = await aggregate(p);
      assert.equal(result.total, 100);
      assert.deepEqual(
        result.items.map((i) => i.score),
        [50, 50],
      );
      console.log(
        "Local MySQL API load: 100 parallel votes in " +
          Math.round(performance.now() - start) +
          "ms; hosting benchmark remains pending.",
      );
    } finally {
      await changePoll(id, "close", actor);
      await app.close();
    }
  },
);
