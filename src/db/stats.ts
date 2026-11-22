export interface Stats {
  usersTotal: number;
  usersToday: number;
  requestsToday: number;
  requests7d: number;
  requestsTotal: number;
  voice7d: number;
  text7d: number;
  moods7d: { mood: string; n: number }[];
  /** batches (of 3 songs) with feedback, last 7 days */
  liked7d: number;
  disliked7d: number;
  batches7d: number;
  refreshes7d: number;
  geminiCallsToday: number;
  activeSongs: number;
}

/**
 * Numbers for /stats (Spec 1.3: return visits and 👍 > 50%).
 * `today` = Cambodia date; "7d" = last 7 × 24 h; Gemini calls use the Pacific date.
 */
export async function getStats(
  db: D1Database,
  today: string,
  pacificToday: string,
): Promise<Stats> {
  const since7d = "datetime('now', '-7 days')";
  const [users, reqs, kinds, moods, batches, gemini, songs] = await db.batch([
    db
      .prepare(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN daily_date = ?1 AND daily_count > 0 THEN 1 ELSE 0 END) AS today FROM users",
      )
      .bind(today),
    db
      .prepare(
        `SELECT COUNT(*) AS total,
              SUM(CASE WHEN created_at >= ${since7d} THEN 1 ELSE 0 END) AS d7,
              SUM(CASE WHEN date(created_at, '+7 hours') = ?1 THEN 1 ELSE 0 END) AS today
       FROM requests`,
      )
      .bind(today),
    db.prepare(
      `SELECT SUM(input_type = 'voice') AS voice, SUM(input_type = 'text') AS text
       FROM requests WHERE created_at >= ${since7d}`,
    ),
    db.prepare(
      `SELECT mood, COUNT(*) AS n FROM requests WHERE created_at >= ${since7d}
       GROUP BY mood ORDER BY n DESC`,
    ),
    db.prepare(
      `SELECT COUNT(*) AS batches,
              SUM(fb = 'like') AS liked,
              SUM(fb = 'dislike') AS disliked,
              SUM(batch > 1) AS refreshes
       FROM (SELECT request_id, batch, MAX(feedback) AS fb FROM recommendations
             WHERE created_at >= ${since7d} GROUP BY request_id, batch)`,
    ),
    db.prepare("SELECT gemini_calls FROM daily_usage WHERE day = ?1").bind(pacificToday),
    db.prepare("SELECT COUNT(*) AS n FROM songs WHERE active = 1"),
  ]);
  type Row = Record<string, number | string | null>;
  const one = (r: D1Result | undefined) => (r?.results?.[0] ?? {}) as Row;
  const num = (v: unknown) => Number(v ?? 0);
  const u = one(users);
  const r = one(reqs);
  const k = one(kinds);
  const b = one(batches);
  return {
    usersTotal: num(u.total),
    usersToday: num(u.today),
    requestsTotal: num(r.total),
    requests7d: num(r.d7),
    requestsToday: num(r.today),
    voice7d: num(k.voice),
    text7d: num(k.text),
    moods7d: ((moods?.results ?? []) as Row[]).map((m) => ({ mood: String(m.mood), n: num(m.n) })),
    batches7d: num(b.batches),
    liked7d: num(b.liked),
    disliked7d: num(b.disliked),
    refreshes7d: num(b.refreshes),
    geminiCallsToday: num(one(gemini).gemini_calls),
    activeSongs: num(one(songs).n),
  };
}

/** /deletemydata: requests and recommendations go with it (ON DELETE CASCADE). */
export async function deleteUser(db: D1Database, userId: number): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run();
}
