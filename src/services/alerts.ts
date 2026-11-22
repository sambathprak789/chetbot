import { Api } from "grammy";

export const ALERT_EVERY_MS = 10 * 60 * 1000; // Spec 7.4: at most 1 message / 10 minutes

/** true if we may send now (and records it). One D1 statement, so two isolates can't both send. */
export async function takeAlertSlot(db: D1Database, key: string, nowMs: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO alerts (key, last_sent_at) VALUES (?1, ?2)
       ON CONFLICT (key) DO UPDATE SET last_sent_at = ?2 WHERE last_sent_at <= ?2 - ?3
       RETURNING last_sent_at`,
    )
    .bind(key, nowMs, ALERT_EVERY_MS)
    .first();
  return row !== null;
}

/**
 * Tell the owner something went wrong (never includes what users wrote or said).
 * Silently does nothing if throttled, or if the owner never opened the bot.
 */
export async function alertOwner(
  env: Env,
  where: string,
  error: unknown,
  nowMs = Date.now(),
): Promise<void> {
  try {
    if (!env.OWNER_ID) return;
    if (!(await takeAlertSlot(env.DB, "error", nowMs))) return;
    const detail = String(error)
      .replace(/bot\d+:[\w-]+/g, "bot<token>")
      .slice(0, 500);
    await new Api(env.BOT_TOKEN).sendMessage(
      Number(env.OWNER_ID),
      `⚠️ ChetBot error\nwhere: ${where}\n${detail}\n\n(next alert in 10 min at the earliest — see Workers Logs)`,
    );
  } catch (e) {
    console.error("alertOwner failed", { error: String(e) });
  }
}
