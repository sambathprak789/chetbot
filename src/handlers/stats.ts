import { getStats, type Stats } from "../db/stats";
import type { BotContext } from "../types";
import { cambodiaDate, pacificDate } from "../utils/time";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export function formatStats(s: Stats, globalLimit: number): string {
  const rated = s.liked7d + s.disliked7d;
  const moods = s.moods7d.length ? s.moods7d.map((m) => `${m.mood} ${m.n}`).join(" · ") : "—";
  return [
    "📊 <b>ChetBot — ស្ថិតិ</b>",
    "",
    `👥 អ្នកប្រើសរុប៖ <b>${s.usersTotal}</b> · ប្រើថ្ងៃនេះ៖ <b>${s.usersToday}</b>`,
    `💬 ការស្នើ៖ ថ្ងៃនេះ <b>${s.requestsToday}</b> · 7 ថ្ងៃ <b>${s.requests7d}</b> · សរុប <b>${s.requestsTotal}</b>`,
    `🎤 7 ថ្ងៃ៖ voice ${s.voice7d} · អក្សរ ${s.text7d}`,
    `🎭 អារម្មណ៍ 7 ថ្ងៃ៖ ${moods}`,
    "",
    `👍 ក្នុងចំណោមអ្នកដែលចុច 👍/👎៖ <b>${pct(s.liked7d, rated)}</b> (${s.liked7d}/${rated}) — គោលដៅ > 50%`,
    `👍 ក្នុងចំណោមលទ្ធផលទាំងអស់៖ ${pct(s.liked7d, s.batches7d)} (${s.liked7d}/${s.batches7d})`,
    `🔄 ការប្តូរបទ 7 ថ្ងៃ៖ ${s.refreshes7d}`,
    "",
    `🤖 Gemini ថ្ងៃនេះ (ម៉ោង Pacific)៖ <b>${s.geminiCallsToday}</b> / ${globalLimit}`,
    `🎵 បទខ្មែរ active៖ ${s.activeSongs}`,
  ].join("\n");
}

/** /stats — owner only (Spec 6.2). Other users get the "unknown command" reply. */
export async function handleStats(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  if (String(ctx.from?.id) !== String(ctx.env.OWNER_ID)) return next();
  const now = Date.now();
  const stats = await getStats(ctx.env.DB, cambodiaDate(now), pacificDate(now));
  await ctx.reply(formatStats(stats, Number(ctx.env.DAILY_GLOBAL_LIMIT)), { parse_mode: "HTML" });
}
