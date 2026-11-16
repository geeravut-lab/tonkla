import { defineConfig } from "@playwright/test";

const port = 3100;
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  // traces off by default: recording every test is expensive
  use: { baseURL: `http://localhost:${port}`, trace: "off", launchOptions: { executablePath, args: ["--no-sandbox"] } },
  projects: [
    { name: "mobile-390x844", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop-1280x800", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    // /preview/* fixtures exist only when this flag is set (never in production)
    env: { ENABLE_PREVIEW: "1" },
  },
});
