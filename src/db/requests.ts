import type { Lang } from "../messages";
import type { Mood } from "../moods";

export interface PickedSong {
  songId: number | null; // null = English song picked by AI
  title: string;
  artist: string;
}

/** Save one request and its first batch of 3 songs (Spec 5.2). Returns the request id. */
export async function saveRequest(
  db: D1Database,
  r: {
    userId: number;
    inputType: "text" | "voice";
    mood: Mood;
    language: Lang;
    songs: PickedSong[];
  },
): Promise<number> {
  const row = await db
    .prepare(
      "INSERT INTO requests (user_id, input_type, mood, language) VALUES (?1, ?2, ?3, ?4) RETURNING id",
    )
    .bind(r.userId, r.inputType, r.mood, r.language)
    .first<{ id: number }>();
  if (!row) throw new Error("insert request failed");
  await addRecommendations(db, row.id, 1, r.songs);
  return row.id;
}

export async function addRecommendations(
  db: D1Database,
  requestId: number,
  batch: number,
  songs: PickedSong[],
): Promise<void> {
  const stmt = db.prepare(
    "INSERT INTO recommendations (request_id, song_id, title, artist, batch) VALUES (?1, ?2, ?3, ?4, ?5)",
  );
  await db.batch(songs.map((s) => stmt.bind(requestId, s.songId, s.title, s.artist, batch)));
}

export interface RequestRow {
  id: number;
  user_id: number;
  mood: Mood;
  language: Lang;
}

export interface RecRow {
  song_id: number | null;
  title: string;
  artist: string;
  batch: number;
}

export async function getRequest(db: D1Database, id: number): Promise<RequestRow | null> {
  return db
    .prepare("SELECT id, user_id, mood, language FROM requests WHERE id = ?1")
    .bind(id)
    .first<RequestRow>();
}

export async function listRecommendations(db: D1Database, requestId: number): Promise<RecRow[]> {
  const { results } = await db
    .prepare(
      "SELECT song_id, title, artist, batch FROM recommendations WHERE request_id = ?1 ORDER BY batch, id",
    )
    .bind(requestId)
    .all<RecRow>();
  return results;
}

/** 👍/👎 applies to the whole batch of 3 songs (Spec 5.3). */
export async function setBatchFeedback(
  db: D1Database,
  requestId: number,
  batch: number,
  feedback: "like" | "dislike",
): Promise<void> {
  await db
    .prepare("UPDATE recommendations SET feedback = ?3 WHERE request_id = ?1 AND batch = ?2")
    .bind(requestId, batch, feedback)
    .run();
}
