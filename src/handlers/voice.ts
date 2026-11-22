import type { Voice } from "grammy/types";
import { errors, listening, songResult } from "../messages";
import { GeminiError } from "../services/gemini";
import { recommend, UnclearVoiceError } from "../services/recommend";
import { downloadTelegramFile, toBase64 } from "../services/telegram-file";
import type { BotContext } from "../types";
import { resultKeyboard } from "./buttons";

export const MAX_VOICE_BYTES = 1024 * 1024; // 1 MB (Spec 5.4)

export type VoiceProblem = "tooLong" | "tooBig" | null;

/** Checks done from Telegram's metadata, before downloading anything (Spec 5.4). */
export function checkVoice(
  voice: Pick<Voice, "duration" | "file_size">,
  maxSeconds: number,
): VoiceProblem {
  if (voice.duration > maxSeconds) return "tooLong";
  if (voice.file_size !== undefined && voice.file_size > MAX_VOICE_BYTES) return "tooBig";
  return null;
}

/** Flow B for voice notes (Spec 2.3). Songs follow the language the user spoke ("auto"). */
export async function handleFeelingVoice(ctx: BotContext): Promise<void> {
  const voice = ctx.message?.voice;
  const from = ctx.from;
  if (!voice || !from) return;

  // We don't know the spoken language yet, so short replies use the stored language.
  const lang = ctx.lang;
  const maxSeconds = Number(ctx.env.MAX_VOICE_SECONDS);

  const problem = checkVoice(voice, maxSeconds);
  if (problem === "tooLong") {
    await ctx.reply(errors.voiceTooLong(maxSeconds)[lang]);
    return;
  }
  if (problem === "tooBig") {
    await ctx.reply(errors.voiceTooBig[lang]);
    return;
  }

  const status = await ctx.reply(listening[lang]);
  await ctx.replyWithChatAction("typing").catch(() => {});
  const edit = (text: string, extra: object = {}) =>
    ctx.api.editMessageText(status.chat.id, status.message_id, text, {
      link_preview_options: { is_disabled: true },
      ...extra,
    });

  try {
    const bytes = await downloadTelegramFile(
      ctx.api,
      ctx.env.BOT_TOKEN,
      voice.file_id,
      MAX_VOICE_BYTES,
    );
    const rec = await recommend(
      ctx.env,
      from.id,
      { kind: "voice", mimeType: voice.mime_type ?? "audio/ogg", base64: toBase64(bytes) },
      "auto",
    );
    await edit(songResult(rec), {
      parse_mode: "HTML",
      reply_markup: resultKeyboard(rec.requestId, 1, Number(ctx.env.MAX_REFRESH)),
    });
  } catch (err) {
    if (err instanceof UnclearVoiceError) {
      await edit(errors.voiceUnclear[err.language]).catch(() => {});
      return;
    }
    console.error("voice recommend failed", { error: String(err) }); // no audio, no token
    const msg = err instanceof GeminiError && err.isQuota ? errors.busy[lang] : errors.failed[lang];
    await edit(msg).catch(() => {});
  }
}
