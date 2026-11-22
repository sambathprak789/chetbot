import moodList from "./moods.json";

/** The 8 moods (Spec 5.2). Single source: moods.json (also read by scripts/). */
export type Mood = "sad" | "happy" | "angry" | "missing" | "love" | "lonely" | "stressed" | "calm";

export const MOODS = moodList as Mood[];

export const MOOD_LABELS: Record<Mood, { km: string; en: string }> = {
  sad: { km: "សោកសៅ", en: "sad" },
  happy: { km: "សប្បាយ", en: "happy" },
  angry: { km: "ខឹង", en: "angry" },
  missing: { km: "នឹករលឹក", en: "missing someone" },
  love: { km: "ស្នេហា", en: "in love" },
  lonely: { km: "ឯកោ", en: "lonely" },
  stressed: { km: "តានតឹង/នឿយហត់", en: "stressed or tired" },
  calm: { km: "ស្ងប់ស្ងាត់", en: "calm" },
};

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && (MOODS as string[]).includes(value);
}
