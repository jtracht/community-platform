import { assertTestDatabase } from "../../packages/database/testing.js";
import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { hashPassword, encrypt, decrypt } from "../../apps/server/src/auth.js";
import { emailHash } from "../../apps/server/src/participation.js";
import { createPoll, changePoll } from "../../apps/server/src/service.js";
import {
  pool,
  rows,
  transaction,
  lockState,
} from "../../packages/database/index.js";
test.beforeAll(async () => {
  assertTestDatabase();
  await pool.execute("DELETE FROM rate_windows");
  process.env.SMTP_HOST = "test.invalid";
  process.env.SMTP_FROM = "test@example.invalid";
  if (process.env.TEST_MYSQL !== "true")
    throw new Error(
      "Browser tests require explicit TEST_MYSQL=true and isolated test DB.",
    );
});
test.afterAll(async () => {
  await pool.end();
});
test.beforeEach(async () => {
  for (const p of await rows<{ id: string }>(
    "SELECT id FROM polls WHERE status IN ('active','scheduled')",
  ))
    await changePoll(p.id, "close", randomUUID());
});
test.afterEach(async () => {
  for (const p of await rows<{ id: string }>(
    "SELECT id FROM polls WHERE status IN ('active','scheduled')",
  ))
    await changePoll(p.id, "close", randomUUID());
});
test("Expandable checkout loads Stripe only on demand and confirms payment through the server", async ({ page }) => {
  let scripts = 0;
  await page.route("**/api/support", route => route.fulfill({ json: { embedded: true, publishableKey: "pk_test_fixture" } }));
  await page.route("https://js.stripe.com/endive/stripe.js", route => {
    scripts++;
    return route.fulfill({ contentType: "application/javascript", body: `window.Stripe = () => ({ createEmbeddedCheckoutPage: async (options) => ({ mount: (selector) => { const button = document.createElement('button'); button.textContent = 'Testzahlung bestätigen'; button.onclick = options.onComplete; document.querySelector(selector).append(button); }, destroy: () => {} }) });` });
  });
  await page.route("**/api/support/session", route => route.fulfill({ json: { clientSecret: "test_fixture", id: "cs_test_fixture", expires: 2000000000, proof: "a".repeat(64) } }));
  await page.route("**/api/support/status", route => route.fulfill({ json: { paid: true } }));
  await page.goto("/");
  await page.locator("#donate-open").click();
  await expect(page.locator("#support-form")).toBeVisible();
  expect(scripts).toBe(0);
  await page.getByRole("button", { name: "Zahlung mit Stripe öffnen" }).click();
  await page.getByRole("button", { name: "Testzahlung bestätigen" }).click();
  await expect(page.locator("#support-message")).toContainText("Stripe hat die Zahlung bestätigt");
  expect(scripts).toBe(1);
  expect(new URL(page.url()).pathname).toBe("/");
  await page.locator("#donate-close").click();
  await expect(page.locator("#donation-panel")).toBeHidden();
  await expect(page.locator("#donate-open")).toBeFocused();
});
for (const type of ["single", "multiple", "ranking", "text"] as const) {
  test(`Mobile ${type} voting, duplicate protection and accessibility`, async ({
    page,
  }) => {
    const actor = randomUUID();
    const id = await createPoll(
      {
        title: "Welche Richtung wählen wir gemeinsam?",
        description: "Ein browsergeprüfter Vorschlag.",
        rules: {
          type,
          options:
            type === "text"
              ? []
              : ["Einfachheit", "Transparenz", "Zugänglichkeit"],
          minChoices: 1,
          maxChoices: 2,
          visibility: "after_vote",
          participation: "anonymous",
        },
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 600000).toISOString(),
      },
      actor,
    );
    await changePoll(id, "schedule", actor);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welche Richtung wählen wir gemeinsam?",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.locator(".submit-count")).toHaveText("Bereits 0 Stimmen");
    await expect(page.locator(".countdown")).toHaveCount(0);
    const ballot = await page.locator(".ballot-panel").elementHandle();
    if (type === "text") {
      await page
        .getByRole("textbox", { name: "Deine Idee" })
        .fill("Eine nachvollziehbare gemeinsame Entscheidung.");
      await page.getByRole("checkbox").check();
    } else if (type === "single")
      await page.getByRole("radio", { name: "Einfachheit" }).check();
    else if (type === "multiple") {
      await page.getByRole("checkbox", { name: "Einfachheit" }).check();
      await page.getByRole("checkbox", { name: "Transparenz" }).check();
      await expect(page.getByText("Auswahl vollständig")).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "Zugänglichkeit" }),
      ).toBeDisabled();
      await page.getByRole("checkbox", { name: "Transparenz" }).uncheck();
      await expect(
        page.getByRole("checkbox", { name: "Zugänglichkeit" }),
      ).toBeEnabled();
      await page.getByRole("checkbox", { name: "Transparenz" }).check();
    } else {
      await page
        .getByRole("button", { name: "Transparenz: Nach oben" })
        .click();
      await expect(page.locator(".rank-row").first()).toContainText(
        "Transparenz",
      );
    }
    await page.getByRole("button", { name: "Stimme abgeben" }).click();
    await expect(
      page.getByText("Danke. Deine Stimme wurde gespeichert."),
    ).toBeVisible();
    expect(await ballot!.evaluate(node => node.isConnected)).toBe(true);
    await expect(page.locator(".ballot-panel.vote-complete")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bereits 1 Stimme", exact: true })).toBeDisabled();
    await expect(page.locator(".countdown")).toBeVisible();
    await expect(page.locator('.ballot-panel input, .ballot-panel textarea')).toHaveCount(0);
    if (type === "single" || type === "multiple")
      await expect(page.getByRole("progressbar")).toHaveCount(3);
    if (type !== "text")
      await expect(page.locator(".result-option .bar")).toHaveCount(3);
    if (type === "ranking")
      await expect(page.locator(".result-option").first()).toContainText("Transparenz");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Stimme abgeben" }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await changePoll(id, "close", actor);
  });
}
test("Waiting state, legal information and protected admin login are accessible", async ({
  page,
}) => {
  await transaction(async (c) => {
    await lockState(c);
    await c.execute(
      "UPDATE platform_state SET transition_mode='waiting' WHERE id=1",
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Aktuell keine Abstimmung.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Impressum" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#legal-text")).toContainText("Browser-Testbetreiber");
  await expect(page.locator("#legal-draft")).toBeVisible();
  await page.getByRole("button", { name: "Schließen" }).click();
  await page.getByRole("link", { name: "Datenschutz", exact: true }).click();
  await expect(page.locator("#legal-text")).toContainText("pseudonymisiert");
  await page.getByRole("button", { name: "Schließen" }).click();
  await page.goto("/datenschutz");
  await expect(page.getByRole("heading", { name: "Datenschutz", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "8. Freiwillige Projektunterstützung über Stripe", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/admin");
  await expect(page.getByRole("textbox", { name: "E-Mail" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Product Owner can prepare, edit and schedule a survey and pause participation", async ({
  page,
}) => {
  const id = randomUUID();
  const email = id + "@example.invalid";
  const password = "browser-test-admin-password";
  const secret = new OTPAuth.Secret({ size: 20 });
  await pool.execute(
    "INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
    [id, email, hashPassword(password), encrypt(secret.base32), "owner"],
  );
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page
    .getByRole("textbox", { name: "Zwei-Faktor-Code" })
    .fill(new OTPAuth.TOTP({ secret }).generate());
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Umfragen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Umfragen", exact: true }).click();
  await page.getByRole("button", { name: "Neue Umfrage vorbereiten" }).click();
  const title = "Eine vom Product Owner vorbereitete Umfrage " + id.slice(0, 8);
  await page.getByLabel("Frage", { exact: true }).fill(title);
  await page
    .getByLabel("Antwortoptionen (eine je Zeile)", { exact: true })
    .fill("Option Eins\nOption Zwei");
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  const article = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(article).toBeVisible();
  await article
    .getByRole("button", { name: "Bearbeiten", exact: true })
    .click();
  await page
    .getByLabel("Einordnung", { exact: true })
    .fill("Vom Product Owner geprüft.");
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "Zeitplan freigeben" }).click();
  await expect(article).toContainText("scheduled");
  await expect(
    article.getByRole("button", { name: "Bearbeiten", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Betrieb", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Teilnahme und neue Umfragestarts pausieren",
    })
    .check();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Teilnahme und neue Umfragestarts pausieren",
    }),
  ).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("checkbox", {
      name: "Teilnahme und neue Umfragestarts pausieren",
    })
    .uncheck();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Anmelden", exact: true }),
  ).toBeVisible();
});

test("Owner records security evidence, follows up without overwriting and exports accessible report", async ({ page }) => {
  const id = randomUUID(), email = id + "@example.invalid";
  const secret = new OTPAuth.Secret({ size: 20 });
  const password = "browser-security-password-long";
  await pool.execute("INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
    [id, email, hashPassword(password), encrypt(secret.base32), "owner"]);
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Zwei-Faktor-Code" }).fill(new OTPAuth.TOTP({ secret }).generate());
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Sicherheit", exact: true }).click();
  await page.getByRole("button", { name: "Sicherheitsbericht erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Bericht und Prüfchronik" })).toBeVisible();
  const title = "Berechtigungen " + id.slice(0, 8);
  await page.getByLabel("Prüftitel", { exact: true }).fill(title);
  await page.getByLabel("Prüfbereich", { exact: true }).selectOption("permissions");
  await page.getByLabel("Prüfergebnis", { exact: true }).selectOption("failed");
  await page.getByLabel("Begründung und Nachweis", { exact: true }).fill("<script>Nur Text, kein Programmcode</script>");
  await page.getByRole("checkbox", { name: "Prüfergebnis ausdrücklich bestätigen" }).check();
  await page.getByRole("button", { name: "Prüfprotokoll speichern" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByLabel("Prüftitel", { exact: true }).fill("Nachprüfung " + id.slice(0, 8));
  await page.getByLabel("Prüfergebnis", { exact: true }).selectOption("passed");
  await page.getByLabel("Begründung und Nachweis", { exact: true }).fill("Berechtigungen nach Korrektur erneut geprüft.");
  await page.getByLabel("Bezug zur bisherigen Prüfung", { exact: true }).selectOption({ label: "Folgeprüfung: " + title });
  await page.getByRole("checkbox", { name: "Prüfergebnis ausdrücklich bestätigen" }).check();
  await page.getByRole("button", { name: "Prüfprotokoll speichern" }).click();
  const original = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(original).toContainText("Fehlgeschlagen · mit Folgeprüfung");
  await expect(original).toContainText("<script>Nur Text, kein Programmcode</script>");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Bericht als JSON exportieren" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^security-report-.*\.json$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.reviews).toHaveLength(2);
  expect(exported.snapshot.days).toBe(7);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
});

for (const mode of ["email", "account"] as const)
  test(`Verified ${mode} participation stays inside the survey`, async ({
    page,
  }) => {
    const actor = randomUUID(),
      email = randomUUID() + "@example.invalid";
    const id = await createPoll(
      {
        title: "Verifizierte Teilnahme " + mode,
        description: "Eine Stimme je verifizierter Identität.",
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 600000).toISOString(),
        rules: {
          type: "single",
          options: ["Ja", "Nein"],
          participation: mode,
          visibility: "after_vote",
        },
      },
      actor,
    );
    await changePoll(id, "schedule", actor);
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "E-Mail-Adresse zur Teilnahme" })
      .fill(email);
    await page
      .getByRole("button", { name: "Bestätigungslink anfordern" })
      .click();
    await expect(
      page.getByText("Die Verifizierungsnachricht wird versendet.", {
        exact: false,
      }),
    ).toBeVisible();
    const job = (
      await rows<{ payload_encrypted: string }>(
        "SELECT m.payload_encrypted FROM mail_jobs m JOIN verification_tokens t ON t.token_hash=m.verification_hash WHERE t.email_hash=? ORDER BY m.created_at DESC",
        [emailHash(email)],
      )
    )[0]!;
    const token = (
      JSON.parse(decrypt(job.payload_encrypted)) as { text: string }
    ).text.match(/#verify=([a-f0-9]{64})/)![1]!;
    await page.goto("/#verify=" + token);
    await expect(
      page.getByRole("radio", { name: "Ja", exact: true }),
    ).toBeVisible();
    expect(page.url()).not.toContain("verify=");
    await page.getByRole("radio", { name: "Ja", exact: true }).check();
    await page.getByRole("button", { name: "Stimme abgeben" }).click();
    await expect(
      page.getByText("Danke. Deine Stimme wurde gespeichert."),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "Datenschutz", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Meine Rohdaten löschen" }).click();
    await expect(
      page.getByText("Rohdaten gelöscht.", { exact: false }),
    ).toBeVisible();
    if (mode === "account")
      expect(
        (
          await rows("SELECT id FROM participants WHERE email_hash=?", [
            emailHash(email),
          ])
        ).length,
      ).toBe(0);
  });
