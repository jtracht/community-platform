import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function mockPages(page: Page) {
  // Layout fixtures must not consume the shared rate budget of API integration tests.
  for (const [path, file] of [["**/", "index.html"], ["**/ueber-das-projekt", "project.html"]] as const) {
    const body = await readFile(new URL("../../apps/public/" + file, import.meta.url), "utf8");
    await page.route(path, route => route.fulfill({ contentType: "text/html", body }));
  }
  await page.route("**/api/project", route => route.fulfill({ json: { polls: 12, votes: 123, operator: "Testbetreiber" } }));
}

test("Survey, results and overlays fit phones, tablets and wide screens", async ({ page }) => {
  test.setTimeout(60000);
  await mockPages(page);
  const options = [
    "Eine lange Antwort mit zusätzlichen Informationen für eine nachvollziehbare Communityentscheidung",
    "EinSehrLangerZusammenhängenderBegriffOhneLeerzeichenDerAuchAufSchmalenBildschirmenLesbarBleibenSoll",
    "Eine weitere Antwort",
  ];
  const poll = {
    id: "layout-fixture",
    title: "Wie soll sich unsere Plattform gemeinsam mit der Community weiterentwickeln?",
    description: "",
    status: "active",
    released: false,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    rules: { type: "multiple", options, participation: "anonymous", visibility: "after_vote", version: 1, quorum: 1, tieRule: "equal", minChoices: 1, maxChoices: 2 },
  };
  let voted = false;
  await page.route("**/api/poll", route => route.fulfill({ json: {
    mode: "poll", poll, voted, participationCount: 123,
    results: voted ? { total: 123, quorumReached: true, items: options.map((label, index) => ({ label, score: 100 - index, percent: 80 - index * 20 })), tie: false } : null,
  } }));
  await page.route("**/api/poll/layout-fixture/schedule", route => route.fulfill({ json: [] }));
  await page.route("**/api/support", route => route.fulfill({ json: { embedded: true, publishableKey: "pk_test_fixture" } }));
  for (const [width, height] of [[320, 568], [390, 844], [667, 375], [768, 1024], [820, 1180], [1024, 768], [1920, 1080], [2560, 1440]] as const) {
    await page.setViewportSize({ width, height });
    voted = false;
    poll.rules.type = "multiple";
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Stimme abgeben" })).toBeVisible();
    const assertNoOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await assertNoOverflow();
    await page.locator(".more-links summary").click();
    await expect.poll(async () => {
      const box = await page.locator(".more-menu").boundingBox();
      return !!box && box.x >= 15 && box.x + box.width <= width - 15 && box.y >= 0 && box.y + box.height <= height;
    }).toBe(true);
    await page.getByRole("heading", { level: 1 }).click();
    await expect(page.locator(".more-links")).not.toHaveAttribute("open", "");
    await page.locator("#donate-open").click();
    await expect(page.locator("#support-form")).toBeVisible();
    const box = (await page.locator("#donation-panel").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.locator("#donate-close").click();
    poll.rules.type = "ranking";
    await page.reload();
    await expect(page.locator(".rank-row")).toHaveCount(3);
    await assertNoOverflow();
    voted = true;
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveCount(3);
    await assertNoOverflow();
    await page.goto("/ueber-das-projekt");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Über das Projekt");
    await assertNoOverflow();
  }
});

test("More menu supports touch dismissal, resizing and Escape", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await mockPages(page);
  await page.route("**/api/poll", route => route.fulfill({ json: { mode: "waiting", message: "Die nächste Abstimmung wird vorbereitet." } }));
  await page.goto("http://127.0.0.1:3100/");
  const more = page.locator(".more-links"), toggle = more.locator("summary");
  await toggle.tap();
  await expect(more).toHaveAttribute("open", "");
  await page.getByRole("heading", { level: 1 }).tap();
  await expect(more).not.toHaveAttribute("open", "");
  await toggle.tap();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await page.locator(".more-menu").boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(15);
  await toggle.press("Escape");
  await expect(more).not.toHaveAttribute("open", "");
  await expect(toggle).toBeFocused();
  await context.close();
});
