"use server";
// Test fixture: counts how many times the action really ran per page load (proves double presses are blocked).
const runs = new Map<string, number>();

export async function slowSubmit(key: string): Promise<{ n: number }> {
  if (!process.env.ENABLE_PREVIEW) return { n: 0 };
  await new Promise((r) => setTimeout(r, 1200));
  const n = (runs.get(key) ?? 0) + 1;
  runs.set(key, n);
  return { n };
}
