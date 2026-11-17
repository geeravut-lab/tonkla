import { describe, expect, it } from "vitest";
import { passwordProblem } from "@/lib/password";

describe("passwordProblem", () => {
  it("accepts a good change", () => expect(passwordProblem("old-pass-1", "new-pass-22", "new-pass-22")).toBeNull());
  it("rejects empty current, short, too long (72 bytes), mismatch and unchanged", () => {
    expect(passwordProblem("", "new-pass-22", "new-pass-22")).toBe("err_password_current_wrong");
    expect(passwordProblem("a", "short", "short")).toBe("err_weak_password");
    expect(passwordProblem("a", "x".repeat(73), "x".repeat(73))).toBe("err_weak_password");
    expect(passwordProblem("a", "ก".repeat(30), "ก".repeat(30))).toBe("err_weak_password"); // Thai letters are 3 bytes each
    expect(passwordProblem("old-pass-1", "new-pass-22", "new-pass-23")).toBe("err_password_mismatch");
    expect(passwordProblem("same-pass-1", "same-pass-1", "same-pass-1")).toBe("err_password_same");
  });
});
