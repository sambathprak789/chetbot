import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { upsertUser } from "../src/db/users";
import { help, helpBilingual, langFromTelegram, welcome } from "../src/messages";
import { escapeHtml } from "../src/utils/html";
import { safeEqual } from "../src/utils/security";

const BASE = "https://chetbot.test";

describe("http routes", () => {
  it("GET / is alive", async () => {
    const res = await exports.default.fetch(`${BASE}/`);
    expect(res.status).toBe(200);
  });

  it("/webhook rejects a missing secret token", async () => {
    const res = await exports.default.fetch(`${BASE}/webhook`, {
      method: "POST",
      body: JSON.stringify({ update_id: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("/setup rejects a wrong key", async () => {
    const res = await exports.default.fetch(`${BASE}/setup?key=wrong`);
    expect(res.status).toBe(403);
  });

  it("unknown path is 404", async () => {
    const res = await exports.default.fetch(`${BASE}/nope`);
    expect(res.status).toBe(404);
  });
});

describe("users table", () => {
  it("creates a user once and keeps the stored language", async () => {
    const first = await upsertUser(env.DB, { id: 42, firstName: "Dara", defaultLang: "km" });
    expect(first).toBe("km");
    const again = await upsertUser(env.DB, { id: 42, firstName: "Dara S", defaultLang: "en" });
    expect(again).toBe("km");
    const row = await env.DB.prepare("SELECT first_name FROM users WHERE id = 42").first();
    expect(row?.first_name).toBe("Dara S");
  });

  it("deleting a user cascades to requests", async () => {
    await upsertUser(env.DB, { id: 7, firstName: "A", defaultLang: "km" });
    await env.DB.prepare(
      "INSERT INTO requests (user_id, input_type, mood, language) VALUES (7, 'text', 'sad', 'km')",
    ).run();
    await env.DB.prepare("DELETE FROM users WHERE id = 7").run();
    const left = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM requests WHERE user_id = 7",
    ).first();
    expect(left?.n).toBe(0);
  });
});

describe("helpers", () => {
  it("escapes HTML", () => {
    expect(escapeHtml("Tom & <Jerry>")).toBe("Tom &amp; &lt;Jerry&gt;");
  });

  it("picks language from Telegram code", () => {
    expect(langFromTelegram("en-US")).toBe("en");
    expect(langFromTelegram("km")).toBe("km");
    expect(langFromTelegram(undefined)).toBe("km");
  });

  it("welcome escapes the user's name", () => {
    expect(welcome("<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("help shows the configured limits", () => {
    const text = help("km", { maxVoiceSeconds: 60, dailyUserLimit: 10 });
    expect(text).toContain("60");
    expect(text).toContain("10");
  });

  it("/help shows Khmer first, then English", () => {
    const text = helpBilingual({ maxVoiceSeconds: 60, dailyUserLimit: 10 });
    const km = text.indexOf("របៀបប្រើ ChetBot");
    const en = text.indexOf("How to use ChetBot");
    expect(km).toBeGreaterThanOrEqual(0);
    expect(en).toBeGreaterThan(km);
    expect(text.length).toBeLessThan(4096); // Telegram message limit
  });

  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
