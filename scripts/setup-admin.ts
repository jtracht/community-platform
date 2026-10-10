import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { hashPassword, encrypt } from "../apps/server/src/auth.js";
import {
  pool,
  rows,
  transaction,
  lockState,
  audit,
  query,
} from "../packages/database/index.js";
import { z } from "zod";
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw new Error("SESSION_SECRET fehlt.");
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const role = z
    .enum(["owner", "moderator", "viewer"])
    .parse(process.env.ADMIN_ROLE ?? "owner");
  const recover = process.env.ADMIN_RECOVER === "true";
  if (
    !recover &&
    role === "owner" &&
    (await rows("SELECT id FROM admins WHERE role=?", ["owner"])).length
  )
    throw new Error("Product Owner existiert bereits.");
  if (
    !recover &&
    role !== "owner" &&
    !(await rows("SELECT id FROM admins WHERE role='owner'")).length
  )
    throw new Error("Zuerst Product Owner einrichten.");
  const email = (
    await rl.question(
      recover
        ? "E-Mail des offline wiederherzustellenden Administrators: "
        : "E-Mail des Administrators (" + role + "): ",
    )
  ).trim();
  if (
    recover &&
    (await rl.question(
      "Wiederherstellung setzt Passwort und TOTP zurück. Zum Bestätigen WIEDERHERSTELLEN eingeben: ",
    )) !== "WIEDERHERSTELLEN"
  )
    throw new Error("Nicht bestätigt.");
  // Password is read from stdin without echo by a temporary raw-mode handler.
  if (!process.stdin.isTTY)
    throw new Error("Interaktives Terminal erforderlich.");
  process.stdout.write("Passwort (mindestens 16 Zeichen, verdeckt): ");
  rl.close();
  const password = await new Promise<string>((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const receive = (b: Buffer) => {
      for (const ch of b.toString()) {
        if (ch === "\u0003") {
          finish();
          reject(new Error("Abgebrochen"));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    const finish = () => {
      process.stdin.off("data", receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    process.stdin.on("data", receive);
  });
  if (password.length < 16 || !/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Ungültige Zugangsdaten.");
  const secret = new OTPAuth.Secret({ size: 20 });
  await transaction(async (c) => {
    await lockState(c);
    if (recover) {
      const existing = (
        await query<{ id: string }>(
          c,
          "SELECT id FROM admins WHERE email=? FOR UPDATE",
          [email],
        )
      )[0];
      if (!existing) throw new Error("Administrator fehlt.");
      await c.execute(
        "UPDATE admins SET password_hash=?,totp_secret=?,last_totp_step=-1,disabled=FALSE WHERE id=?",
        [hashPassword(password), encrypt(secret.base32), existing.id],
      );
      await c.execute("DELETE FROM sessions WHERE admin_id=?", [existing.id]);
      await audit(c, existing.id, "admin.offline_recovered", existing.id);
      return;
    }
    if (
      role === "owner" &&
      (await query(c, "SELECT id FROM admins WHERE role='owner'")).length
    )
      throw new Error("Product Owner existiert bereits.");
    const id = randomUUID();
    await c.execute(
      "INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
      [id, email, hashPassword(password), encrypt(secret.base32), role],
    );
    await audit(c, id, "admin.offline_created", id);
  });
  console.log(
    "Einmalig in der Authenticator-App hinterlegen; sicher offline verwahren:",
  );
  console.log(
    new OTPAuth.TOTP({ issuer: "Community", label: email, secret }).toString(),
  );
} finally {
  rl.close();
  await pool.end();
}
