import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeGlobalSlot, takeUserSlot } from "../src/db/usage";
import { upsertUser } from "../src/db/users";
import { safetyMessage } from "../src/messages";
import { validateAnalysis } from "../src/services/analysis";
import { generateJson, GeminiError } from "../src/services/gemini";
import { useSlot } from "../src/services/limits";
import { recommend, SafetyConcernError } from "../src/services/recommend";
import { usesOnlyAllowedScripts } from "../src/utils/lang";
import { cambodiaDate, pacificDate } from "../src/utils/time";

const T0 = Date.parse("2026-11-22T10:00:00Z"); // 17:00 in Cambodia
const SEC = 1000;

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM recommendations; DELETE FROM requests; DELETE FROM users; DELETE FROM daily_usage;",
  );
  await upsertUser(env.DB, { id: 9, firstName: "U", defaultLang: "km" });
});
afterEach(() => vi.unstubAllGlobals());

describe("dates", () => {
  it("Cambodia day changes at 17:00 UTC (midnight UTC+7)", () => {
    expect(cambodiaDate(Date.parse("2026-11-22T16:59:59Z"))).toBe("2026-11-22");
    expect(cambodiaDate(Date.parse("2026-11-22T17:00:00Z"))).toBe("2026-11-23");
  });

  it("Pacific day follows daylight saving", () => {
    expect(pacificDate(Date.parse("2026-11-22T07:30:00Z"))).toBe("2026-11-21"); // PST, UTC-8
    expect(pacificDate(Date.parse("2026-07-01T06:30:00Z"))).toBe("2026-06-30"); // PDT, UTC-7
  });
});

describe("takeUserSlot", () => {
  const take = (nowMs: number, today = cambodiaDate(nowMs)) =>
    takeUserSlot(env.DB, { userId: 9, nowMs, today, limit: 3, cooldownMs: 10 * SEC });

  it("counts uses and stops at the daily limit", async () => {
    expect(await take(T0)).toEqual({ ok: true, used: 1 });
    expect(await take(T0 + 11 * SEC)).toEqual({ ok: true, used: 2 });
    expect(await take(T0 + 22 * SEC)).toEqual({ ok: true, used: 3 });
    expect(await take(T0 + 33 * SEC)).toEqual({ ok: false, reason: "limit" });
  });

  it("enforces the cooldown and says how long to wait", async () => {
    await take(T0);
    expect(await take(T0 + 3 * SEC)).toEqual({ ok: false, reason: "cooldown", waitSeconds: 7 });
    expect((await take(T0 + 10 * SEC)).ok).toBe(true);
  });

  it("starts again on a new Cambodia day", async () => {
    for (let i = 0; i < 3; i++) await take(T0 + i * 11 * SEC);
    const nextDay = Date.parse("2026-11-22T17:00:05Z");
    expect(await take(nextDay)).toEqual({ ok: true, used: 1 });
  });

  it("refund gives the use back and clears the cooldown", async () => {
    vi.spyOn(Date, "now").mockReturnValue(T0);
    const slot = await useSlot(env, 9, T0);
    await slot.refund();
    const row = await env.DB.prepare(
      "SELECT daily_count, last_request_at FROM users WHERE id = 9",
    ).first();
    expect(row).toEqual({ daily_count: 0, last_request_at: null });
    vi.restoreAllMocks();
  });

  it("the owner has no limit and no cooldown", async () => {
    await upsertUser(env.DB, { id: Number(env.OWNER_ID), firstName: "Owner", defaultLang: "km" });
    for (let i = 0; i < 15; i++)
      expect((await useSlot(env, Number(env.OWNER_ID), T0)).result.ok).toBe(true);
  });
});

describe("global Gemini limit", () => {
  it("allows exactly `limit` calls per day", async () => {
    expect(await takeGlobalSlot(env.DB, "2026-11-22", 2)).toBe(true);
    expect(await takeGlobalSlot(env.DB, "2026-11-22", 2)).toBe(true);
    expect(await takeGlobalSlot(env.DB, "2026-11-22", 2)).toBe(false);
    expect(await takeGlobalSlot(env.DB, "2026-11-23", 2)).toBe(true);
  });

  it("generateJson refuses with 429 and never calls Gemini when the day is used up", async () => {
    await env.DB.prepare("INSERT INTO daily_usage (day, gemini_calls) VALUES (?1, ?2)")
      .bind(pacificDate(Date.now()), Number(env.DAILY_GLOBAL_LIMIT))
      .run();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = await generateJson(env, { system: "s", parts: [{ text: "t" }], schema: {} }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).isQuota).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("safety (Spec 6.3)", () => {
  it("self_harm_risk wins over everything else", () => {
    const r = validateAnalysis(
      {
        self_harm_risk: true,
        unclear: false,
        mood: "sad",
        language: "en",
        comfort: "",
        keywords: [],
        english_songs: [],
      },
      { songLanguage: "auto", excludeKeys: new Set() },
    );
    expect(r.ok && r.value).toMatchObject({ selfHarm: true, unclear: false, language: "en" });
  });

  it("recommend throws SafetyConcernError and saves nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          self_harm_risk: true,
                          unclear: false,
                          mood: "sad",
                          language: "km",
                          comfort: "",
                          keywords: [],
                          english_songs: [],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          ),
      ),
    );
    const err = await recommend(env, 9, { kind: "text", text: "..." }, "km").catch((e) => e);
    expect(err).toBeInstanceOf(SafetyConcernError);
    expect((err as SafetyConcernError).language).toBe("km");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests").first();
    expect(n?.n).toBe(0);
  });

  it("the safety message has the helplines and uses one script per language", () => {
    for (const lang of ["km", "en"] as const) {
      for (const n of ["023 63 66 991", "016 222 597", "095 777 004", "119"])
        expect(safetyMessage[lang]).toContain(n);
      expect(safetyMessage[lang]).not.toContain("017 222 372");
      expect(safetyMessage[lang]).toContain("1280");
      expect(usesOnlyAllowedScripts(safetyMessage[lang].replace(/<\/?b>/g, ""), lang)).toBe(true);
    }
  });
});
