/** YYYY-MM-DD in Cambodia (UTC+7, no daylight saving) — the user's day (Spec 6.4). */
export function cambodiaDate(nowMs: number): string {
  return new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10);
}

const pacific = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Pacific time — when Gemini's daily free quota resets. */
export function pacificDate(nowMs: number): string {
  return pacific.format(new Date(nowMs));
}
