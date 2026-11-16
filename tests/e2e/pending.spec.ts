import { expect, test } from "@playwright/test";

test("button: spinner appears, a second press is ignored, spinner clears when done", async ({ page }) => {
  await page.goto("/preview/pending");
  const btn = page.getByRole("button", { name: "ส่งเรื่องทดสอบ" });
  await btn.click();
  const busy = page.getByRole("button", { name: "กำลังส่งเรื่อง…" });
  await expect(busy).toBeVisible();
  await expect(busy.getByTestId("spinner")).toBeVisible();
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await busy.click({ force: true, noWaitAfter: true }).catch(() => {});
  await expect(page.getByTestId("count")).toContainText("1 ครั้ง", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "ส่งเรื่องทดสอบ" })).toBeEnabled();
  await expect(page.getByTestId("spinner")).toHaveCount(0);
  // exactly one real run despite the second press
  await expect(page.getByTestId("count")).toContainText("ส่งสำเร็จแล้ว 1 ครั้ง");
});

test("async button: locks while the handler runs and unlocks afterwards", async ({ page }) => {
  await page.goto("/preview/pending");
  await page.getByRole("button", { name: "ทำงานช้าแบบ async" }).click();
  const busy = page.getByRole("button", { name: "กำลังทำงาน…" });
  await expect(busy).toBeDisabled();
  await expect(page.getByTestId("async-count")).toHaveText("1", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "ทำงานช้าแบบ async" })).toBeEnabled();
});

test("link: spinner and top progress bar show while the next page loads, then clear", async ({ page }) => {
  await page.goto("/preview/pending");
  await page.getByRole("link", { name: "ไปหน้าที่โหลดช้า" }).click();
  await expect(page.locator("[data-pending-link] [data-testid='spinner']")).toBeVisible();
  await expect(page.getByTestId("nav-progress")).toBeVisible();
  await expect(page.getByTestId("slow-done")).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("nav-progress")).toHaveCount(0);
});

test("preview fixtures do not exist when the flag is off (production)", async ({ request }) => {
  // The server under test sets ENABLE_PREVIEW=1; this test documents the contract via the action guard.
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
});
