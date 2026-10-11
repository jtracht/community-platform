import { readFile, writeFile } from "node:fs/promises";
import { acceptanceTemplate, assessAcceptance } from "../packages/modules/launch-acceptance.js";

const args = process.argv.slice(2);
if (args.length !== 2 || !["--template", "--check"].includes(args[0] ?? "") || !args[1] || args[1].startsWith("--")) {
  console.error("Aufruf: launch-acceptance.js --template DATEI | --check DATEI");
  process.exit(2);
}
try {
  const version = (JSON.parse(await readFile("package.json", "utf8")) as { version: string }).version;
  if (args[0] === "--template") {
    await writeFile(args[1]!, JSON.stringify(acceptanceTemplate(version), null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Private Abnahmevorlage erstellt. Vorhandene Dateien werden nicht überschrieben.");
  } else {
    let sourceCommit: string | undefined;
    try { sourceCommit = (JSON.parse(await readFile("RELEASE.json", "utf8")) as { commit: string }).commit; }
    catch { /* A checkout has no packaged release identity; cannot pass the final check. */ }
    const report = assessAcceptance(JSON.parse(await readFile(args[1]!, "utf8")), version, sourceCommit);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.documentationComplete ? 0 : 1;
  }
} catch {
  console.error("Abnahmedatei nicht lesbar, ungültig oder bereits vorhanden. Inhalte werden zum Schutz privater Nachweise nicht ausgegeben.");
  process.exitCode = 2;
}
