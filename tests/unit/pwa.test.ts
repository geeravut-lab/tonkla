import { describe, expect, it } from "vitest";
import { installMode, isIos } from "@/lib/pwa";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAC = IPAD_AS_MAC;
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";
const env = (o: Partial<Parameters<typeof installMode>[0]>) => ({ ua: ANDROID, touchPoints: 5, standalone: false, hasPrompt: false, ...o });

describe("install button mode", () => {
  it("an already installed app hides the button, even if the browser still offers a prompt", () => {
    expect(installMode(env({ standalone: true }))).toBe("installed");
    expect(installMode(env({ standalone: true, hasPrompt: true }))).toBe("installed");
  });
  it("the browser's own install dialog is used whenever it was offered", () => {
    expect(installMode(env({ hasPrompt: true }))).toBe("prompt");
    expect(installMode(env({ ua: FIREFOX, touchPoints: 0, hasPrompt: true }))).toBe("prompt");
  });
  it("iPhone and iPad get the Share > Add to Home Screen steps", () => {
    expect(installMode(env({ ua: IPHONE }))).toBe("ios");
    expect(installMode(env({ ua: IPAD_AS_MAC, touchPoints: 5 }))).toBe("ios");
  });
  it("a real Mac (no touch screen) is not an iPad", () => {
    expect(isIos(MAC, 0)).toBe(false);
    expect(installMode(env({ ua: MAC, touchPoints: 0 }))).toBe("manual");
  });
  it("other browsers get the manual instructions", () => {
    expect(installMode(env({ ua: FIREFOX, touchPoints: 0 }))).toBe("manual");
    expect(installMode(env({}))).toBe("manual");
  });
});
