import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveRequest, setBatchFeedback } from "../src/db/requests";
import { upsertUser } from "../src/db/users";
import { resultKeyboard } from "../src/handlers/buttons";
import { RefreshError, refreshSongs } from "../src/services/refresh";
import { decodeAction, encodeAction } from "../src/utils/callback";

const gemini = (obj: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  );

let requestId = 0;

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM recommendations; DELETE FROM requests; DELETE FROM songs; DELETE FROM users;",
  );
  // 15 "sad" Khmer songs: enough for batch 1 + 3 refreshes (12) without repeats
  await env.DB.batch(
    Array.from({ length: 15 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO songs (id, title, artist, moods) VALUES (?1, ?2, 'A', 'sad')",
      ).bind(i + 1, `S${i + 1}`),
    ),
  );
  await upsertUser(env.DB, { id: 1, firstName: "Owner", defaultLang: "km" });
  await upsertUser(env.DB, { id: 2, firstName: "Other", defaultLang: "km" });
  requestId = await saveRequest(env.DB, {
    userId: 1,
    inputType: "text",
    mood: "sad",
    language: "km",
    songs: [1, 2, 3].map((i) => ({ songId: i, title: `S${i}`, artist: "A" })),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("callback data", () => {
  it("round-trips every action and stays under 64 bytes", () => {
    const actions = [
      { type: "like", requestId: 123456789, batch: 4 },
      { type: "dislike", requestId: 1, batch: 1 },
      { type: "more", requestId: 99 },
      { type: "lang", language: "en", requestId: 7 },
    ] as const;
    for (const a of actions) {
      const data = encodeAction(a);
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(decodeAction(data)).toEqual(a);
    }
  });

  it("rejects anything else", () => {
    for (const bad of ["", "like:1", "like:x:1", "lang:fr:1", "more:-1", "hack:1:2", "more:1e9"]) {
      expect(decodeAction(bad)).toBeNull();
    }
  });
});

describe("keyboard", () => {
  it("shows 👍 👎 🔄 in one row and hides 🔄 when none are left", () => {
    expect(resultKeyboard(5, 1, 3).inline_keyboard).toHaveLength(1);
    expect(resultKeyboard(5, 1, 3).inline_keyboard[0]!.map((b) => b.text)).toEqual([
      "👍",
      "👎",
      "🔄",
    ]);
    expect(resultKeyboard(5, 4, 0).inline_keyboard[0]!.map((b) => b.text)).toEqual(["👍", "👎"]);
  });
});

describe("feedback", () => {
  it("marks all 3 songs of the batch", async () => {
    await setBatchFeedback(env.DB, requestId, 1, "like");
    const rows = await env.DB.prepare("SELECT feedback FROM recommendations WHERE request_id = ?1")
      .bind(requestId)
      .all();
    expect(rows.results.map((r) => r.feedback)).toEqual(["like", "like", "like"]);
  });
});

describe("refreshSongs (🔄)", () => {
  it("Khmer refresh needs no Gemini call and never repeats a song", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const seen = new Set(["S1", "S2", "S3"]);
    for (let i = 0; i < 3; i++) {
      const r = await refreshSongs(env, 1, requestId);
      expect(r.batch).toBe(i + 2);
      expect(r.refreshesLeft).toBe(2 - i);
      for (const s of r.songs) {
        expect(seen.has(s.title)).toBe(false);
        seen.add(s.title);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after MAX_REFRESH (3)", async () => {
    for (let i = 0; i < 3; i++) await refreshSongs(env, 1, requestId);
    const err = await refreshSongs(env, 1, requestId).catch((e) => e);
    expect(err).toBeInstanceOf(RefreshError);
    expect((err as RefreshError).reason).toBe("limit");
  });

  it("refuses another user's request", async () => {
    const err = await refreshSongs(env, 2, requestId).catch((e) => e);
    expect((err as RefreshError).reason).toBe("notYours");
  });

  it("👎 → English asks Gemini for the same mood and excludes shown English songs", async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) =>
      gemini({
        english_songs: [
          { title: "Someone Like You", artist: "Adele" },
          { title: "Fix You", artist: "Coldplay" },
          { title: "Hurt", artist: "Johnny Cash" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await refreshSongs(env, 1, requestId, "en");
    expect(r.songLanguage).toBe("en");
    expect(r.songs.every((s) => s.songId === null)).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.contents[0].parts[0].text).toContain("MOOD: sad");

    // next 🔄 stays English and sends the 3 shown songs as EXCLUDE
    await refreshSongs(env, 1, requestId).catch(() => {});
    const body2 = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    expect(body2.contents[0].parts[0].text).toContain("Someone Like You — Adele");
  });

  it("drops English songs that were already shown", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          gemini({
            english_songs: [
              { title: "A1", artist: "X" },
              { title: "A2", artist: "X" },
              { title: "A3", artist: "X" },
            ],
          }),
        )
        .mockImplementation(async () =>
          gemini({
            english_songs: [
              { title: "A1", artist: "X" },
              { title: "B2", artist: "X" },
              { title: "B3", artist: "X" },
            ],
          }),
        ),
    );
    await refreshSongs(env, 1, requestId, "en");
    const err = await refreshSongs(env, 1, requestId).catch((e) => e);
    expect(String(err)).toContain("fewer than 3 English songs"); // repeat A1 is not allowed
  });
});
