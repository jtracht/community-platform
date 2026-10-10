import { randomUUID } from "node:crypto";
import { createPoll, changePoll } from "../apps/server/src/service.js";
import { pool, rows } from "../packages/database/index.js";
if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true")
  throw new Error("Demo ausschließlich lokal mit DEMO_MODE=true aktivieren.");
try {
  const actor = randomUUID();
  for (const p of await rows<{ id: string }>(
    "SELECT id FROM polls WHERE status IN ('active','scheduled')",
  ))
    await changePoll(p.id, "close", actor);
  const id = await createPoll(
    {
      title: "Was soll diese Plattform als Nächstes können?",
      description:
        "Wir starten mit einer Frage. Du entscheidest mit, welche Richtung wir gemeinsam einschlagen. Wähle bis zu zwei Vorschläge.",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      rules: {
        type: "multiple",
        options: [
          "Ideen gemeinsam weiterentwickeln",
          "Entscheidungen besser nachvollziehen",
          "Das Erscheinungsbild gemeinsam gestalten",
          "Zunächst die Umfragen verbessern",
        ],
        minChoices: 1,
        maxChoices: 2,
        participation: "anonymous",
        visibility: "after_vote",
        quorum: 0,
        tieRule: "shared",
      },
    },
    actor,
  );
  await changePoll(id, "schedule", actor);
  console.log(
    "Lokale Demo-Umfrage gestartet. Keine echten Communityentscheidungen.",
  );
} finally {
  await pool.end();
}
