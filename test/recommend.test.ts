import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertUser } from "../src/db/users";
import { GeminiError } from "../src/services/gemini";
import { recommend } from "../src/services/recommend";

const geminiReply = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  );
const geminiRaw = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

const good = {
  mood: "sad",
  language: "km",
  comfort: "ខ្ញុំនៅក្បែរអ្នក",
  keywords: ["Song 4"],
  english_songs: [],
};

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM recommendations; DELETE FROM requests; DELETE FROM songs; DELETE FROM users;",
  );
  await env.DB.batch(
    [1, 2, 3, 4].map((i) =>
      env.DB.prepare(
        "INSERT INTO songs (id, title, artist, moods) VALUES (?1, ?2, 'Artist', 'sad')",
      ).bind(i, `Song ${i}`),
    ),
  );
  await upsertUser(env.DB, { id: 100, firstName: "T", defaultLang: "en" });
});
afterEach(() => vi.unstubAllGlobals());

describe("recommend()", () => {
  it("saves the request, 3 songs and the user's language", async () => {
    const fetchMock = vi.fn(async () => geminiReply(good));
    vi.stubGlobal("fetch", fetchMock);

    const rec = await recommend(env, 100, { kind: "text", text: "ខ្ញុំនឿយហត់" }, "km");

    expect(rec.songs).toHaveLength(3);
    expect(rec.songs[0]!.title).toBe("Song 4"); // keyword match comes first
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const recs = await env.DB.prepare(
      "SELECT batch, song_id FROM recommendations WHERE request_id = ?1",
    )
      .bind(rec.requestId)
      .all();
    expect(recs.results).toHaveLength(3);
    const user = await env.DB.prepare("SELECT language FROM users WHERE id = 100").first();
    expect(user?.language).toBe("km");
    const req = await env.DB.prepare("SELECT input_type, mood FROM requests").first();
    expect(req).toEqual({ input_type: "text", mood: "sad" });
  });

  it("retries once after broken JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiRaw("{oops"))
      .mockResolvedValueOnce(geminiReply(good));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recommend(env, 100, { kind: "text", text: "sad" }, "km")).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after two bad answers and saves nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply({ ...good, comfort: "" })),
    );
    await expect(recommend(env, 100, { kind: "text", text: "sad" }, "km")).rejects.toThrow(
      "invalid answer",
    );
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests").first();
    expect(n?.n).toBe(0);
  });

  it("retries when comfort mixes Thai, and keeps the songs with a fallback on the second miss", async () => {
    const mixed = { ...good, comfort: "សម្រាកសិនค่อยបន្ត" };
    const fetchMock = vi.fn(async () => geminiReply(mixed));
    vi.stubGlobal("fetch", fetchMock);
    const rec = await recommend(env, 100, { kind: "text", text: "ហត់" }, "km");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rec.comfort).not.toMatch(/\p{Script=Thai}/u);
    expect(rec.songs).toHaveLength(3);
  });

  it("does not retry when the quota is used up (429)", async () => {
    const fetchMock = vi.fn(async () => new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await recommend(env, 100, { kind: "text", text: "sad" }, "km").catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).isQuota).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send the song list to Gemini", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => geminiReply(good));
    vi.stubGlobal("fetch", fetchMock);
    await recommend(env, 100, { kind: "text", text: "sad" }, "km");
    expect(String(fetchMock.mock.calls[0]![1].body)).not.toContain("Song 1");
  });

  it("English path saves AI songs with song_id NULL", async () => {
    const en = {
      mood: "happy",
      language: "en",
      comfort: "Yay!",
      keywords: [],
      english_songs: [
        { title: "Happy", artist: "Pharrell Williams" },
        { title: "Good as Hell", artist: "Lizzo" },
        { title: "Walking on Sunshine", artist: "Katrina and the Waves" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply(en)),
    );
    const rec = await recommend(env, 100, { kind: "text", text: "I got the job!" }, "en");
    const rows = await env.DB.prepare("SELECT song_id FROM recommendations WHERE request_id = ?1")
      .bind(rec.requestId)
      .all();
    expect(rows.results.every((r) => r.song_id === null)).toBe(true);
  });

  it("sends the API key in a header, not the URL", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => geminiReply(good));
    vi.stubGlobal("fetch", fetchMock);
    await recommend(env, 100, { kind: "text", text: "sad" }, "km");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
    expect(url).toContain(env.GEMINI_MODEL);
  });
});
