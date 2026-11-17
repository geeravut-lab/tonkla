import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CODE_ALPHABET } from "@/server/line-core";

// Pure helpers for the anonymous channel: one-time tokens, case codes and secrets. The token proves "a signed-in member asked for this"
// without saying who: it holds only a random nonce and an expiry.

export const TOKEN_TTL_MS = 60 * 60 * 1000;
const randomFrom = (n: number) => Array.from(randomBytes(n), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

export const newCaseCode = () => `AN-${randomFrom(8)}`;
export const newSecret = () => randomFrom(12);
export const secretHash = (secret: string, key: string) => createHmac("sha256", key).update(`secret:${secret.trim().toUpperCase()}`).digest("hex");
export const nonceHash = (nonce: string) => createHash("sha256").update(nonce).digest("hex");

export function signToken(key: string, now = Date.now()): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = now + TOKEN_TTL_MS;
  const sig = createHmac("sha256", key).update(`${nonce}.${exp}`).digest("hex");
  return `${nonce}.${exp}.${sig}`;
}

export function verifyToken(token: string, key: string, now = Date.now()): { nonce: string } | null {
  const [nonce, exp, sig] = token.split(".");
  if (!nonce || !exp || !sig || !/^[0-9a-f]{32}$/.test(nonce) || !/^\d{10,16}$/.test(exp)) return null;
  const good = createHmac("sha256", key).update(`${nonce}.${exp}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "hex");
  } catch {
    return null;
  }
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null;
  return Number(exp) > now ? { nonce } : null;
}
