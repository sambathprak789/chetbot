import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveRequest, setBatchFeedback } from "../src/db/requests";
import { deleteUser, getStats } from "../src/db/stats";
import { upsertUser } from "../src/db/users";
import { formatStats } from "../src/handlers/stats";
import { commands, deleteTexts, help, ownerCommands } from "../src/messages";
import { ALERT_EVERY_MS, alertOwner, takeAlertSlot } from "../src/services/alerts";
import { decodeAction, encodeAction } from "../src/utils/callback";
import { cambodiaDate, pacificDate } from "../src/utils/time";

const song = (i: number) => ({ songId: null, title: `T${i}`, artist: "A" });

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM recommendations; DELETE FROM requests; DELETE FROM users; DELETE FROM daily_usage; DELETE FROM alerts;",
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("/deletemydata", () => {
  it("removes the user, their requests and recommendations — and nobody else's", async () => {
    await upsertUser(env.DB, { id: 1, firstName: "A", defaultLang: "km" });
    await upsertUser(env.DB, { id: 2, firstName: "B", defaultLang: "km" });
    for (const userId of [1, 2]) {
      await saveRequest(env.DB, {
        userId,
        inputType: "text",
        mood: "sad",
        language: "km",
        songs: [song(1), song(2), song(3)],
      });
    }
    await deleteUser(env.DB, 1);
    const count = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE id = 1")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM requests WHERE user_id = 1")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM requests WHERE user_id = 2")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM recommendations")).toBe(3);
  });

  it("confirm buttons round-trip", () => {
    for (const confirm of [true, false]) {
      expect(decodeAction(encodeAction({ type: "delete", confirm }))).toEqual({
        type: "delete",
        confirm,
      });
    }
    expect(decodeAction("del:maybe")).toBeNull();
    expect(decodeAction("del:yes:1")).toBeNull();
  });

  it("is in the menu, in /help, and warns it cannot be undone", () => {
    expect(commands.km.map((c) => c.command)).toContain("deletemydata");
    expect(help("km", { maxVoiceSeconds: 60, dailyUserLimit: 10 })).toContain("/deletemydata");
    expect(deleteTexts.confirm.km).toContain("មិនអាចយកមកវិញ");
    expect(ownerCommands.en.map((c) => c.command)).toContain("stats");
    expect(commands.en.map((c) => c.command)).not.toContain("stats");
  });
});

describe("/stats", () => {
  it("counts users, requests, moods and the 👍 rate", async () => {
    const now = Date.now();
    await upsertUser(env.DB, { id: 1, firstName: "A", defaultLang: "km" });
    await upsertUser(env.DB, { id: 2, firstName: "B", defaultLang: "en" });
    await env.DB.prepare("UPDATE users SET daily_date = ?1, daily_count = 1 WHERE id = 1")
      .bind(cambodiaDate(now))
      .run();
    const r1 = await saveRequest(env.DB, {
      userId: 1,
      inputType: "voice",
      mood: "sad",
      language: "km",
      songs: [song(1), song(2), song(3)],
    });
    const r2 = await saveRequest(env.DB, {
      userId: 2,
      inputType: "text",
      mood: "sad",
      language: "en",
      songs: [song(4), song(5), song(6)],
    });
    const r3 = await saveRequest(env.DB, {
      userId: 2,
      inputType: "text",
      mood: "happy",
      language: "en",
      songs: [song(7), song(8), song(9)],
    });
    await setBatchFeedback(env.DB, r1, 1, "like");
    await setBatchFeedback(env.DB, r2, 1, "like");
    await setBatchFeedback(env.DB, r3, 1, "dislike");
    await env.DB.prepare("INSERT INTO daily_usage (day, gemini_calls) VALUES (?1, 7)")
      .bind(pacificDate(now))
      .run();

    const s = await getStats(env.DB, cambodiaDate(now), pacificDate(now));
    expect(s).toMatchObject({
      usersTotal: 2,
      usersToday: 1,
      requestsTotal: 3,
      requests7d: 3,
      voice7d: 1,
      text7d: 2,
      liked7d: 2,
      disliked7d: 1,
      batches7d: 3,
      refreshes7d: 0,
      geminiCallsToday: 7,
    });
    expect(s.moods7d[0]).toEqual({ mood: "sad", n: 2 });

    const text = formatStats(s, 200);
    expect(text).toContain("67%"); // 2 of 3 rated batches
    expect(text).toContain("7</b> / 200");
  });

  it("shows — instead of dividing by zero", async () => {
    const s = await getStats(env.DB, "2026-11-22", "2026-11-22");
    expect(formatStats(s, 200)).toContain("—");
  });
});

describe("owner alerts", () => {
  it("sends at most one alert per 10 minutes", async () => {
    const t = 1_000_000;
    expect(await takeAlertSlot(env.DB, "error", t)).toBe(true);
    expect(await takeAlertSlot(env.DB, "error", t + 60_000)).toBe(false);
    expect(await takeAlertSlot(env.DB, "error", t + ALERT_EVERY_MS)).toBe(true);
  });

  it("messages the owner and hides the bot token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await alertOwner(
      env,
      "test",
      new Error("GET https://api.telegram.org/bot123456:ABC-secret/getFile failed"),
      5,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0]![1]?.body);
    expect(body).toContain("bot<token>");
    expect(body).not.toContain("ABC-secret");

    await alertOwner(env, "test", new Error("again"), 6); // throttled
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
