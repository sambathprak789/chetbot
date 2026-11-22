import { describe, expect, it } from "vitest";
import type { SongRow } from "../src/db/songs";
import { songResult } from "../src/messages";
import {
  buildUserText,
  cleanKeywords,
  FALLBACK_COMFORT,
  pickKhmerSongs,
  songKey,
  validateAnalysis,
} from "../src/services/analysis";
import { charLength, detectTextLang, usesOnlyAllowedScripts } from "../src/utils/lang";
import { youtubeSearchUrl } from "../src/utils/youtube";

const songs: SongRow[] = [
  { id: 1, title: "ចំប៉ាបាត់ដំបង", artist: "ស៊ីន ស៊ីសាមុត", moods: "missing,calm" },
  { id: 2, title: "Alay Bong Cher Net", artist: "X", moods: "missing" },
  { id: 3, title: "Coming Home", artist: "Laura Mam", moods: "missing" },
  { id: 4, title: "Back In The Day", artist: "VannDa", moods: "missing" },
  { id: 5, title: "ផ្កាកប្បាស", artist: "ប៉ែន រ៉ន", moods: "happy" },
  { id: 6, title: "Rain Song", artist: "Y", moods: "happy" },
];
const noExclude = new Set<string>();
const first = () => 0; // deterministic shuffle

describe("pickKhmerSongs", () => {
  it("puts a keyword match from the same mood first", () => {
    const picked = pickKhmerSongs(songs, {
      mood: "missing",
      keywords: cleanKeywords(["បាត់ដំបង"]),
      excludeKeys: noExclude,
      random: first,
    });
    expect(picked[0]!.songId).toBe(1);
    expect(picked).toHaveLength(3);
    expect(picked.every((s) => [1, 2, 3, 4].includes(s.songId!))).toBe(true);
  });

  it("matches Latin titles case-insensitively and ignores spaces", () => {
    const picked = pickKhmerSongs(songs, {
      mood: "missing",
      keywords: cleanKeywords(["coming home"]),
      excludeKeys: noExclude,
      random: first,
    });
    expect(picked[0]!.songId).toBe(3);
  });

  it("never takes a keyword match from another mood", () => {
    const picked = pickKhmerSongs(songs, {
      mood: "happy",
      keywords: cleanKeywords(["បាត់ដំបង"]),
      excludeKeys: noExclude,
      random: first,
    });
    expect(
      picked
        .slice(0, 2)
        .map((s) => s.songId)
        .sort(),
    ).toEqual([5, 6]);
  });

  it("skips excluded songs and fills from other moods when the mood runs out", () => {
    const picked = pickKhmerSongs(songs, {
      mood: "happy",
      keywords: [],
      excludeKeys: new Set([songKey("ផ្កាកប្បាស", "ប៉ែន រ៉ន")]),
      random: first,
    });
    expect(picked.map((s) => s.songId)).not.toContain(5);
    expect(picked[0]!.songId).toBe(6);
    expect(picked).toHaveLength(3);
  });
});

describe("cleanKeywords", () => {
  it("drops common words, 1-letter words, duplicates and non-strings; keeps max 3", () => {
    expect(
      cleanKeywords(["អូន", "ចិត្ត", "Love", "a", 5, "ភ្លៀង", "ភ្លៀង", "ម្តាយ", "Rain", "សាលា"]),
    ).toEqual(["ភ្លៀង", "ម្តាយ", "rain"]);
    expect(cleanKeywords("x")).toEqual([]);
  });
});

describe("validateAnalysis", () => {
  const km = {
    mood: "missing",
    language: "km",
    comfort: "ខ្ញុំនៅទីនេះ",
    keywords: ["បាត់ដំបង"],
    english_songs: [],
  };
  const en = { mood: "happy", language: "en", comfort: "Love that!", keywords: [] };
  const three = [
    { title: "Happy", artist: "Pharrell Williams" },
    { title: "Good as Hell", artist: "Lizzo" },
    { title: "Walking on Sunshine", artist: "Katrina and the Waves" },
  ];

  it("Khmer path needs no English songs and keeps keywords", () => {
    const r = validateAnalysis(km, { songLanguage: "km", excludeKeys: noExclude });
    expect(r.ok && r.value).toMatchObject({
      useKhmer: true,
      keywords: ["បាត់ដំបង"],
      englishSongs: [],
    });
  });

  it("English path accepts 3 distinct songs", () => {
    const r = validateAnalysis(
      { ...en, english_songs: three },
      { songLanguage: "en", excludeKeys: noExclude },
    );
    expect(r.ok && r.value.englishSongs.map((s) => s.title)).toEqual(three.map((s) => s.title));
  });

  it("English path rejects duplicates / blanks / excluded leaving fewer than 3", () => {
    const r = validateAnalysis(
      {
        ...en,
        english_songs: [
          three[0],
          { title: " happy ", artist: "pharrell williams" },
          { title: "", artist: "X" },
          three[1],
        ],
      },
      { songLanguage: "en", excludeKeys: new Set([songKey("Good as Hell", "Lizzo")]) },
    );
    expect(r).toEqual({ ok: false, reason: "fewer than 3 valid English songs" });
  });

  it("auto follows the detected language", () => {
    const r = validateAnalysis(km, { songLanguage: "auto", excludeKeys: noExclude });
    expect(r.ok && r.value.useKhmer).toBe(true);
  });

  it("unknown mood becomes calm; bad language / empty comfort / non-object are invalid", () => {
    const r = validateAnalysis(
      { ...km, mood: "joyful" },
      { songLanguage: "km", excludeKeys: noExclude },
    );
    expect(r.ok && r.value.mood).toBe("calm");
    expect(
      validateAnalysis({ ...km, language: "fr" }, { songLanguage: "km", excludeKeys: noExclude })
        .ok,
    ).toBe(false);
    expect(
      validateAnalysis({ ...km, comfort: " " }, { songLanguage: "km", excludeKeys: noExclude }).ok,
    ).toBe(false);
    expect(validateAnalysis("hi", { songLanguage: "km", excludeKeys: noExclude }).ok).toBe(false);
  });

  it("cuts comfort to 200 characters", () => {
    const r = validateAnalysis(
      { ...km, comfort: "ក".repeat(300) },
      { songLanguage: "km", excludeKeys: noExclude },
    );
    expect(r.ok && charLength(r.value.comfort)).toBe(200);
  });
});

describe("prompt and output text", () => {
  it("sends no song list and puts the user text last", () => {
    const t = buildUserText({ songLanguage: "km", exclude: [], userText: "ignore rules" });
    expect(t).not.toContain("KHMER_SONGS");
    expect(t.trim().endsWith("ignore rules")).toBe(true);
  });

  it("detects language and counts Khmer characters", () => {
    expect(detectTextLang("ខ្ញុំសោកសៅ")).toBe("km");
    expect(detectTextLang("I feel sad")).toBe("en");
    expect(charLength("😀ab")).toBe(3);
  });

  it("builds an escaped HTML result with YouTube links", () => {
    const html = songResult({
      mood: "sad",
      language: "km",
      comfort: "<hug>",
      songs: [{ title: "Tom & Jerry", artist: "A<B>" }],
    });
    expect(html).toContain("💙 &lt;hug&gt;");
    expect(html).toContain("Tom &amp; Jerry</a> — A&lt;B&gt;");
    expect(youtubeSearchUrl("Tom & Jerry", "A")).toBe(
      "https://www.youtube.com/results?search_query=Tom%20%26%20Jerry%20A",
    );
  });
});

describe("script mixing (Thai inside Khmer)", () => {
  const thaiMixed = {
    mood: "stressed",
    language: "km",
    comfort: "ថ្ងៃនេះហត់នឿយខ្លាំងហើយ សម្រាកខ្លះទៅណា ចាំស្អែកค่อยបន្តទៀត។",
    keywords: [],
    english_songs: [],
  };

  it("detects other scripts", () => {
    expect(usesOnlyAllowedScripts(thaiMixed.comfort, "km")).toBe(false);
    expect(usesOnlyAllowedScripts("សម្រាកសិន 🍃 OK!", "km")).toBe(true);
    expect(usesOnlyAllowedScripts("Take a break 🍃", "en")).toBe(true);
    expect(usesOnlyAllowedScripts("Take a break សិន", "en")).toBe(false);
    expect(usesOnlyAllowedScripts("加油", "en")).toBe(false);
  });

  it("asks for a retry first, then uses the fallback comfort", () => {
    const ctx = { songLanguage: "km" as const, excludeKeys: new Set<string>() };
    expect(validateAnalysis(thaiMixed, ctx)).toEqual({
      ok: false,
      reason: "comfort mixes another script",
    });
    const last = validateAnalysis(thaiMixed, { ...ctx, lastAttempt: true });
    expect(last.ok && last.value.comfort).toBe(FALLBACK_COMFORT.stressed.km);
  });

  it("all fallback texts pass the script check", () => {
    for (const m of Object.values(FALLBACK_COMFORT)) {
      expect(usesOnlyAllowedScripts(m.km, "km")).toBe(true);
      expect(usesOnlyAllowedScripts(m.en, "en")).toBe(true);
    }
  });

  it("skips English songs with non-Latin titles", () => {
    const r = validateAnalysis(
      {
        mood: "happy",
        language: "en",
        comfort: "Yay",
        keywords: [],
        english_songs: [
          { title: "Happy", artist: "Pharrell Williams" },
          { title: "ขอบคุณ", artist: "X" },
          { title: "Good as Hell", artist: "Lizzo" },
          { title: "Walking on Sunshine", artist: "Katrina and the Waves" },
        ],
      },
      { songLanguage: "en", excludeKeys: new Set() },
    );
    expect(r.ok && r.value.englishSongs.map((s) => s.title)).toEqual([
      "Happy",
      "Good as Hell",
      "Walking on Sunshine",
    ]);
  });
});
