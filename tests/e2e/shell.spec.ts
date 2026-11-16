import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/login", "/", "/news", "/news/new", "/reports", "/ideas", "/inbox", "/directory", "/account"];

for (const path of PAGES) {
  test(`${path}: no horizontal scroll, no serious a11y violations`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const res = await new AxeBuilder({ page }).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });
}

test("login shows the logo and a favicon link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("img", { name: /Tonkla/ })).toBeVisible();
  expect(await page.locator("link[rel='icon']").count()).toBeGreaterThan(0);
});

test("menu: bottom bar on phone, sidebar on desktop", async ({ page, isMobile }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
  await expect(nav.first()).toBeVisible();
  const bottom = page.locator("nav.fixed");
  const side = page.locator("aside");
  if (isMobile) {
    await expect(bottom).toBeVisible();
    await expect(side).toBeHidden();
  } else {
    await expect(side).toBeVisible();
    await expect(bottom).toBeHidden();
  }
});

test("tap targets in the main menu are at least 44px", async ({ page, isMobile }) => {
  await page.goto("/");
  const links = page.locator(isMobile ? "nav.fixed a, nav.fixed button" : "aside nav a");
  const n = await links.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("phone: More sheet opens, scrolls inside 85dvh, and the device Back button closes it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/");
  await page.getByRole("button", { name: "เพิ่มเติม" }).click();
  const dialog = page.getByRole("dialog", { name: "เมนูเพิ่มเติม" });
  await expect(dialog).toBeVisible();
  const box = await dialog.locator("> div").last().boundingBox();
  expect(box!.height).toBeLessThanOrEqual(844 * 0.85 + 1);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test("language switch changes the page language", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
  await page.getByRole("button", { name: "English" }).last().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello");
});
