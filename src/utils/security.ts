/** Telegram allows only A-Z, a-z, 0-9, _ and - in secret_token (1–256 chars). */
export const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** Compare two strings without leaking where they differ through timing. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
