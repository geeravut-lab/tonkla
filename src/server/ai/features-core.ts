// Pure helpers for the AI features: building prompts from DATA fenced in tags, and reading the answers defensively.
// The model only ever suggests. A person presses the button that acts.

export function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
const SEVERITIES = ["low", "medium", "high", "critical"];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const noTags = (s: string) => s.replace(/[<>]/g, " "); // user text must never close or open our fences

export type Triage = { category_id: string | null; severity: string | null; reason: string };
export function parseTriage(text: string, categoryIds: string[]): Triage {
  const j = extractJson(text) as { category_id?: unknown; severity?: unknown; reason?: unknown } | null;
  const id = typeof j?.category_id === "string" && categoryIds.includes(j.category_id) ? j.category_id : null;
  const sev = typeof j?.severity === "string" && SEVERITIES.includes(j.severity) ? j.severity : null;
  return { category_id: id, severity: sev, reason: typeof j?.reason === "string" ? clip(j.reason, 200) : "" };
}
export function parseDuplicates(text: string, ids: string[]): { ids: string[]; confidence: number } {
  const j = extractJson(text) as { duplicates?: unknown; confidence?: unknown } | null;
  const list = Array.isArray(j?.duplicates) ? (j!.duplicates as unknown[]).filter((x): x is string => typeof x === "string" && ids.includes(x)) : [];
  const c = typeof j?.confidence === "number" ? Math.min(1, Math.max(0, j.confidence)) : 0;
  return { ids: c >= 0.5 ? list : [], confidence: c };
}
export function parseCandidate(text: string, count: number): { index: number; reason: string } | null {
  const j = extractJson(text) as { candidate?: unknown; reason?: unknown } | null;
  const n = typeof j?.candidate === "number" ? Math.trunc(j.candidate) : NaN;
  if (!(n >= 1 && n <= count)) return null;
  return { index: n - 1, reason: typeof j?.reason === "string" ? clip(j.reason, 200) : "" };
}

export function triagePrompt(categories: { id: string; name: string }[], title: string, description: string): string {
  return `<categories>\n${categories.map((c) => `${c.id}: ${noTags(c.name)}`).join("\n")}\n</categories>\n<report>\nTitle: ${noTags(clip(title, 200))}\nDescription: ${noTags(clip(description, 1500))}\n</report>\nReturn JSON: {"category_id":"<one id from the list, or null>","severity":"low|medium|high|critical","reason":"<one short sentence in Thai>"}`;
}
export function duplicatePrompt(items: { id: string; title: string }[], title: string, description: string): string {
  return `${items.map((i) => `<item id="${i.id}">${noTags(clip(i.title, 200))}</item>`).join("\n")}\n<new>\n${noTags(clip(title, 200))}\n${noTags(clip(description, 800))}\n</new>\nReturn JSON: {"duplicates":["<ids of items that describe the same problem>"],"confidence":<0 to 1>}`;
}
export function ownerPrompt(candidates: { department: string; position: string }[], categoryName: string, severity: string, title: string): string {
  return `<candidates>\n${candidates.map((c, i) => `${i + 1}: ${noTags(c.department || "-")} / ${noTags(c.position || "-")}`).join("\n")}\n</candidates>\n<report>\nCategory: ${noTags(categoryName)}\nSeverity: ${severity}\nTitle: ${noTags(clip(title, 200))}\n</report>\nPick the candidate whose department and position best fit this report. Return JSON: {"candidate":<number from the list>,"reason":"<one short sentence in Thai>"}`;
}
export function digestPrompt(lang: "th" | "en", stats: Record<string, unknown>, themes: { name: string; n: number }[]): string {
  return `Write the summary in ${lang === "th" ? "Thai" : "English"}, at most 120 words, in short bullet lines. Use only these numbers.\n<stats>${JSON.stringify(stats)}</stats>\n<themes>${JSON.stringify(themes)}</themes>`;
}
export function kbPrompt(question: string, docs: { id: string; title: string; text: string }[]): string {
  return `${docs.map((d) => `<document id="${d.id}" title="${noTags(d.title)}">\n${noTags(clip(d.text, 3500))}\n</document>`).join("\n")}\n<question>\n${noTags(clip(question, 500))}\n</question>\nAnswer in the language of the question, in at most 150 words. End with the titles of the documents you used.`;
}
export function translatePrompt(text: string, to: "th" | "en"): string {
  return `Target language: ${to === "th" ? "Thai" : "English"}\n<text>\n${noTags(clip(text, 6000))}\n</text>`;
}
