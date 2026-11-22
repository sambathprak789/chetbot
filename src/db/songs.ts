export interface SongRow {
  id: number;
  title: string;
  artist: string;
  moods: string;
}

export async function listActiveSongs(db: D1Database): Promise<SongRow[]> {
  const { results } = await db
    .prepare("SELECT id, title, artist, moods FROM songs WHERE active = 1 ORDER BY id")
    .all<SongRow>();
  return results;
}
