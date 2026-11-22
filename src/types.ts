import type { Context } from "grammy";
import type { Lang } from "./messages";

/** grammY context with our own fields added by middleware. */
export type BotContext = Context & {
  env: Env;
  /** Language to reply in (stored on the user row, default from Telegram). */
  lang: Lang;
};
