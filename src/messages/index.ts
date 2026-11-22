import { escapeHtml } from "../utils/html";

export type Lang = "km" | "en";

/** Pick a reply language from Telegram's language_code (used for new users). */
export function langFromTelegram(code: string | undefined): Lang {
  return code?.toLowerCase().startsWith("en") ? "en" : "km";
}

/** Flow A — welcome is always bilingual. */
export function welcome(firstName: string): string {
  const name = escapeHtml(firstName || "");
  return [
    `សួស្តី ${name} 👋`,
    `ខ្ញុំគឺ <b>ChetBot (ចិត្តបទ)</b> 🎵`,
    `ផ្ញើ voice ឬវាយអក្សរ ប្រាប់ខ្ញុំពីអារម្មណ៍របស់អ្នកនៅពេលនេះ ខ្ញុំនឹងជ្រើសបទចម្រៀងដែលត្រូវនឹងចិត្តអ្នក។`,
    ``,
    `Hi ${name} 👋`,
    `I'm <b>ChetBot</b> 🎵`,
    `Send a voice note or type how you feel right now, and I'll pick songs that match your mood.`,
  ].join("\n");
}

export interface HelpLimits {
  maxVoiceSeconds: number;
  dailyUserLimit: number;
}

export function help(lang: Lang, l: HelpLimits): string {
  if (lang === "en") {
    return [
      `<b>How to use ChetBot</b>`,
      `🎤 Send a voice note (up to ${l.maxVoiceSeconds} seconds) or ✍️ type how you feel`,
      `🎵 I'll reply with a few kind words and 3 songs`,
      `👍 👎 🔄 Tap a button to say the songs fit, don't fit, or to get different songs`,
      ``,
      `<b>Limits</b>`,
      `You can use the bot ${l.dailyUserLimit} times a day (tapping 🔄 counts too).`,
      ``,
      `<b>Privacy</b>`,
      `• I don't store your voice or your text — only the mood type and language.`,
      `• Your voice or text is sent to Google Gemini for analysis. On the free tier, Google may use this data to improve its services. Please don't send personal details such as phone numbers or addresses.`,
    ].join("\n");
  }
  return [
    `<b>របៀបប្រើ ChetBot</b>`,
    `🎤 ផ្ញើ voice (មិនលើស ${l.maxVoiceSeconds} វិនាទី) ឬ ✍️ វាយអក្សរ ប្រាប់ពីអារម្មណ៍របស់អ្នក`,
    `🎵 ខ្ញុំនឹងឆ្លើយដោយពាក្យលើកទឹកចិត្តខ្លីៗ និងបទចម្រៀង 3 បទ`,
    `👍 👎 🔄 ចុចប៊ូតុង ដើម្បីប្រាប់ថាបទត្រូវចិត្ត មិនត្រូវចិត្ត ឬចង់បានបទផ្សេង`,
    ``,
    `<b>ដែនកំណត់</b>`,
    `អ្នកអាចប្រើបាន ${l.dailyUserLimit} ដងក្នុងមួយថ្ងៃ (ការចុច 🔄 ក៏រាប់ដែរ)។`,
    ``,
    `<b>ឯកជនភាព</b>`,
    `• ខ្ញុំមិនរក្សាទុកសំឡេង ឬអក្សរដែលអ្នកផ្ញើទេ — រក្សាតែប្រភេទអារម្មណ៍ និងភាសាប៉ុណ្ណោះ។`,
    `• សំឡេង ឬអក្សររបស់អ្នកត្រូវបានផ្ញើទៅ Google Gemini ដើម្បីវិភាគ។ ក្នុងកម្រិតឥតគិតថ្លៃ Google អាចប្រើទិន្នន័យនេះដើម្បីកែលម្អសេវារបស់ខ្លួន។ សូមកុំផ្ញើព័ត៌មានផ្ទាល់ខ្លួន ដូចជាលេខទូរស័ព្ទ ឬអាសយដ្ឋាន។`,
  ].join("\n");
}

/** Menu commands shown by Telegram (registered by /setup). */
export const commands: Record<Lang, { command: string; description: string }[]> = {
  en: [
    { command: "start", description: "Start ChetBot" },
    { command: "help", description: "How to use and privacy" },
  ],
  km: [
    { command: "start", description: "ចាប់ផ្តើម ChetBot" },
    { command: "help", description: "របៀបប្រើ និងឯកជនភាព" },
  ],
};
