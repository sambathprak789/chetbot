import type { PickedSong } from "../db/requests";
import { saveRequest } from "../db/requests";
import { listActiveSongs } from "../db/songs";
import { setUserLanguage } from "../db/users";
import type { Lang } from "../messages";
import type { Mood } from "../moods";
import {
  ANALYSIS_SCHEMA,
  buildUserText,
  pickKhmerSongs,
  SYSTEM_PROMPT,
  validateAnalysis,
  type Analysis,
  type SongLanguage,
} from "./analysis";
import { generateJson, GeminiError, type GeminiPart } from "./gemini";

export type FeelingInput =
  { kind: "text"; text: string } | { kind: "voice"; mimeType: string; base64: string };

export interface Recommendation {
  requestId: number;
  mood: Mood;
  language: Lang;
  comfort: string;
  songs: PickedSong[];
}

/** Gemini call with one retry for broken JSON / invalid answers / 5xx (Spec 5.4). */
async function analyze(
  env: Env,
  input: FeelingInput,
  songLanguage: SongLanguage,
): Promise<Analysis> {
  const parts: GeminiPart[] = [
    {
      text: buildUserText({
        songLanguage,
        exclude: [],
        userText: input.kind === "text" ? input.text : undefined,
      }),
    },
  ];
  if (input.kind === "voice") {
    parts.push({ inlineData: { mimeType: input.mimeType, data: input.base64 } });
  }

  let lastReason = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, usage } = await generateJson(env, {
        system: SYSTEM_PROMPT,
        parts,
        schema: ANALYSIS_SCHEMA,
      });
      console.log("gemini usage", { input: input.kind, attempt, ...usage }); // numbers only
      const checked = validateAnalysis(json, {
        songLanguage,
        excludeKeys: new Set(),
        lastAttempt: attempt === 2,
      });
      if (checked.ok) return checked.value;
      lastReason = checked.reason;
    } catch (err) {
      const retryable =
        err instanceof SyntaxError || (err instanceof GeminiError && err.status >= 500);
      if (!retryable || attempt === 2) throw err;
      lastReason = String(err);
    }
  }
  throw new Error(`invalid answer: ${lastReason}`);
}

/** The voice note could not be understood — nothing is saved (Flow D). */
export class UnclearVoiceError extends Error {
  constructor(readonly language: Lang) {
    super("voice not understood");
    this.name = "UnclearVoiceError";
  }
}

/** The user may be at risk — show the safety message instead of songs; nothing is saved (Spec 6.3). */
export class SafetyConcernError extends Error {
  constructor(readonly language: Lang) {
    super("safety concern");
    this.name = "SafetyConcernError";
  }
}

/** Analyze the feeling, pick 3 songs, save the request (keywords are never stored). */
export async function recommend(
  env: Env,
  userId: number,
  input: FeelingInput,
  songLanguage: SongLanguage,
): Promise<Recommendation> {
  const a = await analyze(env, input, songLanguage);
  if (a.selfHarm) throw new SafetyConcernError(a.language);
  if (a.unclear) {
    if (input.kind === "voice") throw new UnclearVoiceError(a.language);
    throw new Error("invalid answer: unclear on text");
  }

  let songs = a.englishSongs;
  if (a.useKhmer) {
    songs = pickKhmerSongs(await listActiveSongs(env.DB), {
      mood: a.mood,
      keywords: a.keywords,
      excludeKeys: new Set(),
    });
    if (songs.length < 3) throw new Error("not enough active Khmer songs");
  }

  const requestId = await saveRequest(env.DB, {
    userId,
    inputType: input.kind,
    mood: a.mood,
    language: a.language,
    songs,
  });
  await setUserLanguage(env.DB, userId, a.language);
  return { requestId, mood: a.mood, language: a.language, comfort: a.comfort, songs };
}
