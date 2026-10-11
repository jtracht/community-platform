import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

export type LegalContent = Readonly<{
  operator: string;
  address: string;
  email: string;
  imprint: string;
  privacy: string;
  contributions: string;
  reviewed: boolean;
}>;

const operatorKeys = [
  "OPERATOR_NAME",
  "OPERATOR_ADDRESS",
  "OPERATOR_EMAIL",
] as const;
const unfinished = /\[ERGÄNZEN:[^\]]*\]|\{\{[A-Z_]+\}\}|^\s*(?:ENTWURF|DRAFT)\b/im;

async function document(
  env: NodeJS.ProcessEnv,
  textKey: string,
  fileKey: string,
  fallback = "",
) {
  const inline = env[textKey]?.trim() || undefined;
  const path = env[fileKey]?.trim();
  if (inline && path)
    throw new Error(`${textKey} und ${fileKey} dürfen nicht gleichzeitig gesetzt sein.`);
  let text = inline ?? fallback;
  if (path) {
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > 262144) throw new Error("Invalid document");
      text = (await readFile(path, "utf8")).trim();
      if (!text) throw new Error("Empty document");
    } catch {
      throw new Error(`${fileKey}: Rechtstext fehlt, ist leer oder nicht lesbar (max. 256 KiB).`);
    }
  }
  return text.replace(/\{\{(OPERATOR_NAME|OPERATOR_ADDRESS|OPERATOR_EMAIL)\}\}/g,
    (_, key: string) => env[key]?.trim() || `[ERGÄNZEN: ${key}]`,
  );
}

export async function loadLegalContent(env: NodeJS.ProcessEnv = process.env): Promise<LegalContent> {
  const [imprint, privacy, contributions] = await Promise.all([
    document(env, "LEGAL_IMPRINT_TEXT", "LEGAL_IMPRINT_FILE",
      operatorKeys.map((key) => env[key]?.trim()).filter(Boolean).join("\n")),
    document(env, "LEGAL_PRIVACY_TEXT", "LEGAL_PRIVACY_FILE"),
    document(env, "LEGAL_CONTRIBUTION_TERMS", "LEGAL_CONTRIBUTION_FILE"),
  ]);
  return Object.freeze({
    operator: env.OPERATOR_NAME?.trim() ?? "",
    address: env.OPERATOR_ADDRESS?.trim() ?? "",
    email: env.OPERATOR_EMAIL?.trim() ?? "",
    imprint,
    privacy,
    contributions,
    reviewed: env.LEGAL_REVIEWED === "true",
  });
}

export function assertProductionLegalContent(content: LegalContent) {
  const required = [content.operator, content.address, content.email,
    content.imprint, content.privacy, content.contributions];
  if (!content.reviewed || required.some((value) => !value.trim() || unfinished.test(value)) ||
      !z.email().safeParse(content.email).success)
    throw new Error("Produktionsstart blockiert: Betreiberangaben und Rechtstexte vollständig ergänzen und freigeben; Entwürfe sind nicht zulässig.");
}
