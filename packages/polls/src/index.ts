import { z } from "zod";
export const rulesSchema = z
  .object({
    type: z.enum(["text", "single", "multiple", "ranking"]),
    options: z.array(z.string().trim().min(1).max(200)).max(30),
    minChoices: z.number().int().min(1).max(30).default(1),
    maxChoices: z.number().int().min(1).max(30).default(1),
    visibility: z.enum([
      "hidden",
      "after_vote",
      "after_close",
      "after_release",
    ]),
    participation: z.literal("anonymous"),
    quorum: z.number().int().min(0).default(0),
    tieRule: z.enum(["shared", "runoff"]).default("shared"),
    version: z.literal(1).default(1),
  })
  .superRefine((r, c) => {
    if (
      r.type !== "text" &&
      (r.options.length < 2 || new Set(r.options).size !== r.options.length)
    )
      c.addIssue({
        code: "custom",
        message: "Mindestens zwei unterschiedliche Optionen erforderlich.",
      });
    if (
      r.minChoices > r.maxChoices ||
      (r.type === "multiple" && r.maxChoices > r.options.length)
    )
      c.addIssue({ code: "custom", message: "Ungültige Auswahlgrenzen." });
  });
export type Rules = z.infer<typeof rulesSchema>;
export type Answer = string | number[];
export type Poll = {
  id: string;
  title: string;
  description: string;
  rules: Rules;
  startsAt: string;
  endsAt: string;
  status: "draft" | "scheduled" | "active" | "closed" | "archived";
  released: boolean;
};
export const pollInput = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).default(""),
    rules: rulesSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .refine((p) => Date.parse(p.endsAt) > Date.parse(p.startsAt), {
    message: "Ende muss nach dem Start liegen.",
  });
export function validateAnswer(r: Rules, input: unknown): Answer {
  if (r.type === "text") return z.string().trim().min(3).max(2000).parse(input);
  const a = z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(r.options.length - 1),
    )
    .parse(input);
  if (new Set(a).size !== a.length) throw new Error("Doppelte Auswahl.");
  if (r.type === "single" && a.length !== 1)
    throw new Error("Genau eine Antwort auswählen.");
  if (
    r.type === "multiple" &&
    (a.length < r.minChoices || a.length > r.maxChoices)
  )
    throw new Error("Auswahlgrenzen nicht eingehalten.");
  if (r.type === "ranking" && a.length !== r.options.length)
    throw new Error("Alle Optionen genau einmal sortieren.");
  return a;
}
export function results(r: Rules, answers: Answer[]) {
  const counts = r.options.map(() => 0);
  if (r.type === "text")
    return {
      total: answers.length,
      quorumReached: answers.length >= r.quorum,
      items: [],
      tie: false,
      runoffRequired: false,
    };
  for (const answer of answers) {
    const a = validateAnswer(r, answer) as number[];
    a.forEach((id, rank) => {
      counts[id] =
        (counts[id] ?? 0) +
        (r.type === "ranking" ? r.options.length - 1 - rank : 1);
    });
  }
  const denominator =
    r.type === "ranking"
      ? answers.length * (r.options.length - 1)
      : answers.length;
  const items = r.options.map((label, id) => ({
    id,
    label,
    score: counts[id] ?? 0,
    percent: denominator
      ? Math.round(((counts[id] ?? 0) / denominator) * 1000) / 10
      : 0,
  }));
  const maximum = Math.max(...counts);
  const tie =
    answers.length > 0 && counts.filter((x) => x === maximum).length > 1;
  return {
    total: answers.length,
    quorumReached: answers.length >= r.quorum,
    items,
    tie,
    runoffRequired: tie && r.tieRule === "runoff",
  };
}
export function maySeeResults(p: Poll, voted: boolean): boolean {
  if (p.rules.visibility === "hidden") return false;
  if (p.rules.visibility === "after_vote") return voted;
  if (p.rules.visibility === "after_close")
    return p.status === "closed" || p.status === "archived";
  return p.released;
}
