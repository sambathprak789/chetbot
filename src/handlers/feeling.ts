import { errors, listening, songResult } from "../messages";
import { GeminiError } from "../services/gemini";
import { recommend } from "../services/recommend";
import type { BotContext } from "../types";
import { charLength, detectTextLang } from "../utils/lang";

const MIN_CHARS = 3;
const MAX_CHARS = 500;

/** Flow B for typed text (Spec 2.3, 5.4). Voice: handlers/voice.ts. */
export async function handleFeelingText(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text?.trim() ?? "";
  const from = ctx.from;
  if (!from) return;
  const lang = detectTextLang(text);

  const len = charLength(text);
  if (len < MIN_CHARS) {
    await ctx.reply(errors.tooShort[lang]);
    return;
  }
  if (len > MAX_CHARS) {
    await ctx.reply(errors.tooLong(MAX_CHARS)[lang]);
    return;
  }

  const status = await ctx.reply(listening[lang]);
  await ctx.replyWithChatAction("typing").catch(() => {});

  try {
    // Typed text: songs follow the language the user wrote in (Spec 2.3 B6)
    const rec = await recommend(ctx.env, from.id, { kind: "text", text }, lang);
    await ctx.api.editMessageText(status.chat.id, status.message_id, songResult(rec), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("recommend failed", { error: String(err) }); // never log the user's text
    const msg = err instanceof GeminiError && err.isQuota ? errors.busy[lang] : errors.failed[lang];
    await ctx.api.editMessageText(status.chat.id, status.message_id, msg).catch(() => {});
  }
}
