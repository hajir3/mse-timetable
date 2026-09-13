import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const value = process.env.ICS_SIGNING_SECRET;
  if (!value) throw new Error("ICS_SIGNING_SECRET is not set");
  return value;
}

/**
 * Signs a Clerk user ID so it can be embedded in a public, unauthenticated
 * calendar-subscription URL — calendar apps poll subscription feeds
 * directly, with no session/cookie — without letting anyone construct a
 * valid feed URL for someone else's account.
 */
export function signUserId(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUserId(userId: string, signature: string): boolean {
  const expected = Buffer.from(signUserId(userId), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
