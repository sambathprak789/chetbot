import type { Lang } from "../messages";

const KHMER = /[ក-៿᧠-᧿]/;

/** Guess the language of typed text: any Khmer letter → km, otherwise en. */
export function detectTextLang(text: string): Lang {
  return KHMER.test(text) ? "km" : "en";
}

/** Length in characters as people count them (code points, not UTF-16 units). */
export function charLength(text: string): number {
  return [...text].length;
}

/**
 * True when every letter is in the allowed scripts:
 * km → Khmer or Latin, en → Latin only. Digits, punctuation, spaces and emoji are always fine.
 * Catches the model slipping in Thai, Lao, Chinese, etc. (e.g. "ค่อย" inside Khmer text).
 */
export function usesOnlyAllowedScripts(text: string, lang: Lang): boolean {
  const allowed = lang === "km" ? /[\p{Script=Khmer}\p{Script=Latin}]/u : /\p{Script=Latin}/u;
  for (const ch of text) {
    if (/\p{L}/u.test(ch) && !allowed.test(ch)) return false;
  }
  return true;
}
