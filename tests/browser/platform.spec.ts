import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createPoll, changePoll } from "../../apps/server/src/service.js";
import {
  pool,
  rows,
  transaction,
  lockState,
} from "../../packages/database/index.js";
test.beforeAll(() => {
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
    await expect(
      page.getByRole("heading", { name: "Ergebnis", exact: true }),
    ).toBeVisible();
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
      name: "Der nächste Schritt entsteht gemeinsam.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Impressum" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Schließen" }).click();
  await page.goto("/admin");
  await expect(page.getByRole("textbox", { name: "E-Mail" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
