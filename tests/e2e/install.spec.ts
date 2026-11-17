import { expect, test } from "@playwright/test";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

/** What Chrome fires when the site can be installed: a cancelable event with prompt() and userChoice. */
async function offerInstall(page: import("@playwright/test").Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((o) => {
    const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    (window as unknown as { __prompted: number }).__prompted = 0;
    ev.prompt = async () => {
      (window as unknown as { __prompted: number }).__prompted++;
    };
    ev.userChoice = Promise.resolve({ outcome: o });
    window.dispatchEvent(ev);
  }, outcome);
}

test("manifest can be installed: id, icons, shortcuts, standalone", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.id).toBe("/");
  expect(m.start_url).toBe("/");
  expect(m.icons.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
  expect(m.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/reports/new", "/ideas/new"]);
});

test("account page: browser offers install, the button opens the browser dialog and the card then says installed", async ({ page }) => {
  await page.goto("/account");
  const card = page.getByTestId("pwa-card");
  await expect(card).toBeVisible();
  await offerInstall(page, "accepted");
  await card.getByTestId("pwa-install").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  await expect(page.getByTestId("pwa-help")).toHaveCount(0);
  await expect(page.getByTestId("pwa-installed")).toBeVisible();
  await expect(page.getByTestId("pwa-install")).toHaveCount(0);
});

test("account page: declining keeps the button and says so", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByTestId("pwa-card")).toBeVisible();
  await offerInstall(page, "dismissed");
  await page.getByTestId("pwa-card").getByTestId("pwa-install").click();
  await expect(page.getByRole("status").filter({ hasText: "ยังไม่ได้ติดตั้ง" })).toBeVisible();
  await expect(page.getByTestId("pwa-card").getByTestId("pwa-install")).toBeEnabled();
});

test("browser without an install dialog: the button shows where to find it, and Escape closes it", async ({ page }) => {
  await page.goto("/account");
  await page.getByTestId("pwa-card").getByTestId("pwa-install").click();
  const help = page.getByTestId("pwa-help");
  await expect(help).toBeVisible();
  await expect(help).toContainText("Chrome");
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
});

test.describe("iPhone", () => {
  test.use({ userAgent: IPHONE });
  test("shows the Share > Add to Home Screen steps", async ({ page }) => {
    await page.goto("/account");
    await page.getByTestId("pwa-card").getByTestId("pwa-install").click();
    const help = page.getByTestId("pwa-help");
    await expect(help).toContainText("เพิ่มไปยังหน้าจอโฮม");
    await expect(help).toContainText("Safari");
    await help.getByRole("button", { name: "ปิด" }).last().click();
    await expect(help).toHaveCount(0);
  });
});

test("menu: the install button is in the sidebar (desktop) or the More sheet (phone)", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pwa-install")).toBeVisible();
    const box = await sheet.getByTestId("pwa-install").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.locator("aside").getByTestId("pwa-install")).toBeVisible();
  }
});
