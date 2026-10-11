import { randomUUID, createHmac, createHash } from "node:crypto";
import {
  pool,
  rows,
  query,
  transaction,
  lockState,
  audit,
  toPoll,
  json,
} from "../../../packages/database/index.js";
import {
  pollInput,
  validateAnswer,
  results,
  maySeeResults,
  type Poll,
  type Answer,
} from "../../../packages/polls/src/index.js";
export function voterHash(id: string, poll: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update("vote:" + poll + ":" + id)
    .digest("hex");
}
export async function phases() {
  return transaction(async (c) => {
    const state = await lockState(c);
    const now = new Date();
    const current = state.current_poll_id
      ? (
          await query(c, "SELECT * FROM polls WHERE id=? FOR UPDATE", [
            state.current_poll_id,
          ])
        )[0]
      : undefined;
    if (
      current &&
      current.status === "active" &&
      Date.parse(toPoll(current).endsAt) <= now.getTime()
    ) {
      await c.execute("UPDATE polls SET status='closed' WHERE id=?", [
        String(current.id),
      ]);
      await audit(c, null, "poll.auto_closed", String(current.id));
    }
    const stillActive = (
      await query(c, "SELECT id FROM polls WHERE status='active' LIMIT 1")
    )[0];
    const module = (
      await query<{ enabled: boolean; version: string }>(
        c,
        "SELECT enabled,version FROM modules WHERE id='polls'",
      )
    )[0];
    if (
      !stillActive &&
      !state.paused &&
      module?.enabled &&
      module.version === "1.0.0"
    ) {
      const next = (
        await query(
          c,
          "SELECT * FROM polls WHERE status='scheduled' AND starts_at<=? AND ends_at>? ORDER BY starts_at,id LIMIT 1 FOR UPDATE",
          [now, now],
        )
      )[0];
      if (next) {
        await c.execute("UPDATE polls SET status='active' WHERE id=?", [
          String(next.id),
        ]);
        await c.execute(
          "UPDATE platform_state SET current_poll_id=? WHERE id=1",
          [String(next.id)],
        );
        await audit(c, null, "poll.auto_started", String(next.id));
      }
    }
    await c.execute(
      "UPDATE polls SET status='closed' WHERE status='scheduled' AND ends_at<=?",
      [now],
    );
  });
}
export async function current(
  voter?: string,
  resolveIdentity?: (poll: Poll) => Promise<string | undefined>,
) {
  await phases();
  const state = (await rows("SELECT * FROM platform_state WHERE id=1"))[0]!;
  const module = (
    await rows<{ enabled: boolean; version: string }>(
      "SELECT enabled,version FROM modules WHERE id='polls'",
    )
  )[0];
  if (!module?.enabled || module.version !== "1.0.0")
    return { mode: "waiting", message: state.waiting_message };
  if (state.paused) return { mode: "waiting", message: state.waiting_message };
  const record = state.current_poll_id
    ? (
        await rows("SELECT * FROM polls WHERE id=?", [
          String(state.current_poll_id),
        ])
      )[0]
    : undefined;
  if (!record) return { mode: "waiting", message: state.waiting_message };
  const p = toPoll(record);
  if (resolveIdentity) voter = await resolveIdentity(p);
  const voted = Boolean(
    voter &&
    (
      await rows("SELECT id FROM votes WHERE poll_id=? AND voter_hash=?", [
        p.id,
        voterHash(voter, p.id),
      ])
    ).length,
  );
  if (p.status !== "active" && state.transition_mode === "waiting")
    return { mode: "waiting", message: state.waiting_message };
  const visible = maySeeResults(p, voted);
  // Turnout is public by design; answer distributions retain their visibility gates.
  const participationCount = p.released
    ? (await aggregate(p)).total
    : (
        await rows<{ total: number }>(
          "SELECT COUNT(*) AS total FROM votes WHERE poll_id=? AND valid=TRUE",
          [p.id],
        )
      )[0]!.total;
  return {
    mode: p.status === "active" ? "poll" : "results",
    poll: p,
    voted,
    participationCount,
    verified: p.rules.participation === "anonymous" || Boolean(voter),
    results: visible ? await aggregate(p) : null,
  };
}
export async function aggregate(p: Poll) {
  if (p.released) {
    const decision = (
      await rows<{ result: unknown }>(
        "SELECT result FROM decisions WHERE poll_id=?",
        [p.id],
      )
    )[0];
    if (decision) return json<ReturnType<typeof results>>(decision.result);
  }
  const a = await rows<{ answer: unknown }>(
    "SELECT answer FROM votes WHERE poll_id=? AND valid=TRUE",
    [p.id],
  );
  return results(
    p.rules,
    a.map((x) => json<Answer>(x.answer)),
  );
}
export async function vote(
  id: string,
  voter: string,
  answer: unknown,
  mode = "anonymous",
  sessionHash?: string,
) {
  return transaction(async (c) => {
    const state = await lockState(c);
    const module = (
      await query<{ enabled: boolean; version: string }>(
        c,
        "SELECT enabled,version FROM modules WHERE id='polls'",
      )
    )[0];
    if (!module?.enabled || module.version !== "1.0.0")
      throw new Error("Umfragemodul derzeit nicht verfügbar.");
    if (state.paused) throw new Error("Teilnahme derzeit pausiert.");
    const record = (
      await query(c, "SELECT * FROM polls WHERE id=? FOR UPDATE", [id])
    )[0];
    if (!record) throw new Error("Umfrage fehlt.");
    const p = toPoll(record);
    if (p.rules.participation !== mode)
      throw new Error(
        "Teilnahmeverfahren stimmt nicht mit den Umfrageregeln überein.",
      );
    if (mode !== "anonymous") {
      if (!sessionHash) throw new Error("Verifizierte Sitzung erforderlich.");
      const session = (
        await query(
          c,
          "SELECT s.token_hash FROM participant_sessions s LEFT JOIN participants u ON u.id=s.participant_id WHERE s.token_hash=? AND s.identity_key=? AND s.mode=? AND (s.poll_id IS NULL OR s.poll_id=?) AND s.expires_at>UTC_TIMESTAMP(3) AND (u.disabled IS NULL OR u.disabled=FALSE)",
          [sessionHash, voter, mode, id],
        )
      )[0];
      if (!session) throw new Error("Verifizierte Sitzung nicht mehr gültig.");
    }
    const now = Date.now();
    if (
      p.status !== "active" ||
      now < Date.parse(p.startsAt) ||
      now >= Date.parse(p.endsAt)
    )
      throw new Error("Umfrage ist nicht aktiv.");
    const valid = validateAnswer(p.rules, answer);
    if (p.rules.type === "text") {
      const terms =
        process.env.LEGAL_CONTRIBUTION_TERMS ?? "development-unreviewed";
      await c.execute(
        "INSERT IGNORE INTO legal_versions(hash,content) VALUES(?,?)",
        [createHash("sha256").update(terms).digest("hex"), terms],
      );
    }
    const voteId = randomUUID();
    await c.execute(
      "INSERT INTO votes(id,poll_id,voter_hash,answer,contribution_terms_hash) VALUES(?,?,?,?,?)",
      [
        voteId,
        id,
        voterHash(voter, id),
        JSON.stringify(valid),
        p.rules.type === "text"
          ? createHash("sha256")
              .update(
                process.env.LEGAL_CONTRIBUTION_TERMS ??
                  "development-unreviewed",
              )
              .digest("hex")
          : null,
      ],
    );
    if (p.rules.type === "text") {
      const content = valid as string;
      const duplicate = (
        await query<{ id: string }>(
          c,
          "SELECT id FROM ideas WHERE poll_id=? AND original=? LIMIT 1",
          [id, content],
        )
      )[0];
      const spam = /(https?:\/\/.*){3}|(.)\1{15}/i.test(content);
      await c.execute(
        "INSERT INTO ideas(id,poll_id,vote_id,original,content,spam_flag,duplicate_of) VALUES(?,?,?,?,?,?,?)",
        [
          randomUUID(),
          id,
          voteId,
          content,
          content,
          spam,
          duplicate?.id ?? null,
        ],
      );
    }
  });
}
export async function createPoll(input: unknown, actor: string) {
  const data = pollInput.parse(input);
  const id = randomUUID();
  await transaction(async (c) => {
    await lockState(c);
    await c.execute(
      "INSERT INTO polls(id,title,description,rules,starts_at,ends_at) VALUES(?,?,?,?,?,?)",
      [
        id,
        data.title,
        data.description,
        JSON.stringify(data.rules),
        new Date(data.startsAt),
        new Date(data.endsAt),
      ],
    );
    await audit(c, actor, "poll.created", id);
  });
  return id;
}
export async function changePoll(id: string, action: string, actor: string) {
  await transaction(async (c) => {
    await lockState(c);
    const record = (
      await query(c, "SELECT * FROM polls WHERE id=? FOR UPDATE", [id])
    )[0];
    if (!record) throw new Error("Umfrage fehlt.");
    const p = toPoll(record);
    if (action === "schedule") {
      if (
        p.rules.participation !== "anonymous" &&
        (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
      )
        throw new Error(
          "SMTP und Absender vor Freigabe einer verifizierten Umfrage konfigurieren.",
        );
      if (p.status !== "draft" || Date.parse(p.endsAt) <= Date.now())
        throw new Error("Entwurf mit zukünftigem Ende erforderlich.");
      const overlap = await query(
        c,
        "SELECT id FROM polls WHERE id<>? AND status IN ('active','scheduled') AND starts_at<? AND ends_at>? LIMIT 1",
        [id, new Date(p.endsAt), new Date(p.startsAt)],
      );
      if (overlap.length)
        throw new Error(
          "Zeitfenster überschneidet sich mit einer offiziellen Umfrage.",
        );
      await c.execute("UPDATE polls SET status='scheduled' WHERE id=?", [id]);
    } else if (action === "close") {
      if (p.status !== "active" && p.status !== "scheduled")
        throw new Error("Nicht aktive oder geplante Umfrage.");
      await c.execute(
        "UPDATE polls SET status='closed', ends_at=LEAST(ends_at,UTC_TIMESTAMP(3)) WHERE id=?",
        [id],
      );
    } else if (action === "release") {
      if (p.status !== "closed" || p.released)
        throw new Error(
          "Abgeschlossene, unveröffentlichte Auswertung erforderlich.",
        );
      const answers = await query<{ answer: unknown }>(
        c,
        "SELECT answer FROM votes WHERE poll_id=? AND valid=TRUE",
        [id],
      );
      const result = results(
        p.rules,
        answers.map((a) => json<Answer>(a.answer)),
      );
      await c.execute(
        "INSERT INTO decisions(id,poll_id,title,result) VALUES(?,?,?,?)",
        [randomUUID(), id, p.title, JSON.stringify(result)],
      );
      await c.execute("UPDATE polls SET released=TRUE WHERE id=?", [id]);
    } else if (action === "archive") {
      if (p.status !== "closed")
        throw new Error("Nur abgeschlossene Umfragen archivieren.");
      await c.execute("UPDATE polls SET status='archived' WHERE id=?", [id]);
    } else throw new Error("Unbekannte Aktion.");
    await audit(c, actor, "poll." + action, id);
  });
  await phases();
}
export { pool };
