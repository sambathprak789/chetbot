import {
  addRecommendations,
  getRequest,
  listRecommendations,
  type PickedSong,
  type RequestRow,
} from "../db/requests";
import { listActiveSongs } from "../db/songs";
import type { Lang } from "../messages";
import {
  buildEnglishSongsText,
  ENGLISH_SONGS_PROMPT,
  ENGLISH_SONGS_SCHEMA,
  parseEnglishSongs,
  pickKhmerSongs,
  songKey,
} from "./analysis";
import { generateJson, GeminiError } from "./gemini";

export type RefreshFailure = "notFound" | "notYours" | "limit" | "noSongs";

export class RefreshError extends Error {
  constructor(
    readonly reason: RefreshFailure,
    readonly language: Lang,
  ) {
    super(`refresh failed: ${reason}`);
    this.name = "RefreshError";
  }
}

export interface RefreshResult {
  request: RequestRow;
  batch: number;
  songLanguage: Lang;
  songs: PickedSong[];
  refreshesLeft: number;
}

/** Ask Gemini for 3 English songs for a mood, retrying once (Spec 5.4). */
async function englishSongsForMood(
  env: Env,
  request: RequestRow,
  exclude: string[],
  excludeKeys: Set<string>,
) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, usage } = await generateJson(env, {
        system: ENGLISH_SONGS_PROMPT,
        parts: [{ text: buildEnglishSongsText(request.mood, exclude) }],
        schema: ENGLISH_SONGS_SCHEMA,
      });
      console.log("gemini usage", { input: "refresh", attempt, ...usage });
      const songs = parseEnglishSongs(
        (json as { english_songs?: unknown })?.english_songs,
        excludeKeys,
      );
      if (songs.length === 3) return songs;
    } catch (err) {
      const retryable =
        err instanceof SyntaxError || (err instanceof GeminiError && err.status >= 500);
      if (!retryable || attempt === 2) throw err;
    }
  }
  throw new Error("invalid answer: fewer than 3 English songs");
}

/**
 * New batch of 3 songs for the same request (🔄, or 👎 + language choice).
 * - same mood, never a song already shown for this request (Spec 5.4)
 * - at most MAX_REFRESH new batches per request
 * - Khmer songs come from D1 (no Gemini call); English songs need one Gemini call
 * `language` = which songs to give; default = the language of the latest batch.
 */
export async function refreshSongs(
  env: Env,
  userId: number,
  requestId: number,
  language?: Lang,
): Promise<RefreshResult> {
  const request = await getRequest(env.DB, requestId);
  if (!request) throw new RefreshError("notFound", "km");
  if (request.user_id !== userId) throw new RefreshError("notYours", request.language);

  const shown = await listRecommendations(env.DB, requestId);
  const lastBatch = shown.reduce((m, r) => Math.max(m, r.batch), 0);
  const maxRefresh = Number(env.MAX_REFRESH);
  if (lastBatch - 1 >= maxRefresh) throw new RefreshError("limit", request.language);

  const lastWasKhmer = shown.filter((r) => r.batch === lastBatch).some((r) => r.song_id !== null);
  const songLanguage: Lang = language ?? (lastWasKhmer ? "km" : "en");
  const excludeKeys = new Set(shown.map((r) => songKey(r.title, r.artist)));

  let songs: PickedSong[];
  if (songLanguage === "km") {
    songs = pickKhmerSongs(await listActiveSongs(env.DB), {
      mood: request.mood,
      keywords: [],
      excludeKeys,
    });
    if (songs.length < 3) throw new RefreshError("noSongs", request.language);
  } else {
    const exclude = shown.filter((r) => r.song_id === null).map((r) => `${r.title} — ${r.artist}`);
    songs = await englishSongsForMood(env, request, exclude, excludeKeys);
  }

  const batch = lastBatch + 1;
  await addRecommendations(env.DB, requestId, batch, songs);
  return { request, batch, songLanguage, songs, refreshesLeft: maxRefresh - (batch - 1) };
}
