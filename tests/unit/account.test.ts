import { describe, expect, it } from "vitest";
import { accountLabel } from "@/lib/account";

describe("who is signed in, as shown on every page", () => {
  it("shows the e-mail address of a Google or password account", () => {
    expect(accountLabel({ email: "somchai@company.example", displayName: "สมชาย" })).toBe("somchai@company.example");
  });
  it("shows the name for an Aivora (LINE) account, never its made-up address", () => {
    expect(accountLabel({ email: "aivora-1234@users.tonkla.invalid", displayName: "สมชาย" })).toBe("สมชาย");
  });
  it("falls back to the name when there is no address", () => {
    expect(accountLabel({ email: null, displayName: "สมชาย" })).toBe("สมชาย");
  });
});
