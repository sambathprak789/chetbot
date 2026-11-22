import { env } from "cloudflare:workers";
import { Api } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertUser } from "../src/db/users";
import { checkVoice, MAX_VOICE_BYTES } from "../src/handlers/voice";
import { validateAnalysis } from "../src/services/analysis";
import { recommend, UnclearVoiceError } from "../src/services/recommend";
import { downloadTelegramFile, toBase64 } from "../src/services/telegram-file";

const gemini = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  );

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM recommendations; DELETE FROM requests; DELETE FROM songs; DELETE FROM users;",
  );
  await env.DB.batch(
    [1, 2, 3].map((i) =>
      env.DB.prepare(
        "INSERT INTO songs (id, title, artist, moods) VALUES (?1, ?2, 'A', 'lonely')",
      ).bind(i, `S${i}`),
    ),
  );
  await upsertUser(env.DB, { id: 5, firstName: "V", defaultLang: "km" });
});
afterEach(() => vi.unstubAllGlobals());

describe("checkVoice (before download)", () => {
  it("rejects long or big voice notes", () => {
    expect(checkVoice({ duration: 61 }, 60)).toBe("tooLong");
    expect(checkVoice({ duration: 10, file_size: MAX_VOICE_BYTES + 1 }, 60)).toBe("tooBig");
    expect(checkVoice({ duration: 60, file_size: 200_000 }, 60)).toBeNull();
    expect(checkVoice({ duration: 5 }, 60)).toBeNull();
  });
});

describe("toBase64", () => {
  it("matches the standard encoding, also for large input", () => {
    expect(toBase64(new TextEncoder().encode("Hello"))).toBe("SGVsbG8=");
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    const decoded = Uint8Array.from(atob(toBase64(big)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(big);
  });
});

describe("downloadTelegramFile", () => {
  it("calls getFile then downloads the bytes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/getFile")) {
        return Response.json({
          ok: true,
          result: { file_id: "f", file_unique_id: "u", file_path: "voice/f.oga" },
        });
      }
      expect(url).toBe("https://api.telegram.org/file/bot123:T/voice/f.oga");
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const bytes = await downloadTelegramFile(new Api("123:T"), "123:T", "f", 10);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("refuses a file bigger than the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input instanceof Request ? input.url : input).includes("/getFile")
          ? Response.json({
              ok: true,
              result: { file_id: "f", file_unique_id: "u", file_path: "p" },
            })
          : new Response(new Uint8Array(11)),
      ),
    );
    await expect(downloadTelegramFile(new Api("123:T"), "123:T", "f", 10)).rejects.toThrow(
      "too large",
    );
  });
});

describe("recommend() with voice", () => {
  const voice = { kind: "voice" as const, mimeType: "audio/ogg", base64: "AAAA" };

  it("sends the audio inline and lets Gemini pick the language (auto)", async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) =>
      gemini({
        unclear: false,
        mood: "lonely",
        language: "km",
        comfort: "អ្នកមិននៅម្នាក់ឯងទេ",
        keywords: [],
        english_songs: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rec = await recommend(env, 5, voice, "auto");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "audio/ogg", data: "AAAA" },
    });
    expect(body.contents[0].parts[0].text).toContain("SONG_LANGUAGE: auto");
    expect(rec.songs.every((s) => s.songId !== null)).toBe(true);
    const req = await env.DB.prepare("SELECT input_type FROM requests").first();
    expect(req?.input_type).toBe("voice");
  });

  it("spoken English gets English songs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        gemini({
          unclear: false,
          mood: "lonely",
          language: "en",
          comfort: "You're not alone.",
          keywords: [],
          english_songs: [
            { title: "Lean on Me", artist: "Bill Withers" },
            { title: "Fix You", artist: "Coldplay" },
            { title: "You've Got a Friend", artist: "Carole King" },
          ],
        }),
      ),
    );
    const rec = await recommend(env, 5, voice, "auto");
    expect(rec.language).toBe("en");
    expect(rec.songs.every((s) => s.songId === null)).toBe(true);
  });

  it("unclear voice throws UnclearVoiceError and saves nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        gemini({
          unclear: true,
          mood: "calm",
          language: "km",
          comfort: "",
          keywords: [],
          english_songs: [],
        }),
      ),
    );
    const err = await recommend(env, 5, voice, "auto").catch((e) => e);
    expect(err).toBeInstanceOf(UnclearVoiceError);
    expect((err as UnclearVoiceError).language).toBe("km");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests").first();
    expect(n?.n).toBe(0);
  });

  it("validateAnalysis accepts an unclear answer without other fields", () => {
    const r = validateAnalysis({ unclear: true }, { songLanguage: "auto", excludeKeys: new Set() });
    expect(r.ok && r.value.unclear).toBe(true);
  });
});
