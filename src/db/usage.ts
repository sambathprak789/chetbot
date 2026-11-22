export type SlotResult =
  | { ok: true; used: number }
  | { ok: false; reason: "limit" }
  | { ok: false; reason: "cooldown"; waitSeconds: number };

/**
 * Take one use for this user in a single atomic UPDATE (Spec 6.4):
 * - daily_count resets when the Cambodia date changes
 * - refused when daily_count reached `limit`, or the last request was < cooldown ago
 */
export async function takeUserSlot(
  db: D1Database,
  o: { userId: number; nowMs: number; today: string; limit: number; cooldownMs: number },
): Promise<SlotResult> {
  const row = await db
    .prepare(
      `UPDATE users SET
         daily_count = CASE WHEN daily_date = ?2 THEN daily_count + 1 ELSE 1 END,
         daily_date = ?2,
         last_request_at = ?3
       WHERE id = ?1
         AND (daily_date IS NOT ?2 OR daily_count < ?4)
         AND (last_request_at IS NULL OR last_request_at <= ?3 - ?5)
       RETURNING daily_count`,
    )
    .bind(o.userId, o.today, o.nowMs, o.limit, o.cooldownMs)
    .first<{ daily_count: number }>();
  if (row) return { ok: true, used: row.daily_count };

  const u = await db
    .prepare("SELECT daily_count, daily_date, last_request_at FROM users WHERE id = ?1")
    .bind(o.userId)
    .first<{ daily_count: number; daily_date: string | null; last_request_at: number | null }>();
  if (u && u.daily_date === o.today && u.daily_count >= o.limit)
    return { ok: false, reason: "limit" };
  const since = o.nowMs - (u?.last_request_at ?? 0);
  return {
    ok: false,
    reason: "cooldown",
    waitSeconds: Math.max(1, Math.ceil((o.cooldownMs - since) / 1000)),
  };
}

/** Give the use back when we could not deliver songs because of our side (Gemini error etc.). */
export async function refundUserSlot(db: D1Database, userId: number, today: string): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET daily_count = MAX(daily_count - 1, 0), last_request_at = NULL WHERE id = ?1 AND daily_date = ?2",
    )
    .bind(userId, today)
    .run();
}

/** Count one Gemini call for the day; false when DAILY_GLOBAL_LIMIT is reached. */
export async function takeGlobalSlot(db: D1Database, day: string, limit: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO daily_usage (day, gemini_calls) VALUES (?1, 1)
       ON CONFLICT (day) DO UPDATE SET gemini_calls = gemini_calls + 1 WHERE gemini_calls < ?2
       RETURNING gemini_calls`,
    )
    .bind(day, limit)
    .first<{ gemini_calls: number }>();
  return row !== null && row.gemini_calls <= limit;
}
