import type { Mood } from "../moods";
import { escapeHtml } from "../utils/html";
import { youtubeSearchUrl } from "../utils/youtube";

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
      `• Tap /deletemydata any time to delete everything I keep about you.`,
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
    `• ចុច /deletemydata ពេលណាក៏បាន ដើម្បីលុបទិន្នន័យទាំងអស់ដែលខ្ញុំរក្សាអំពីអ្នក។`,
  ].join("\n");
}

/** Menu commands shown by Telegram (registered by /setup). */
export const commands: Record<Lang, { command: string; description: string }[]> = {
  en: [
    { command: "start", description: "Start ChetBot" },
    { command: "help", description: "How to use and privacy" },
    { command: "deletemydata", description: "Delete my data" },
  ],
  km: [
    { command: "start", description: "ចាប់ផ្តើម ChetBot" },
    { command: "help", description: "របៀបប្រើ និងឯកជនភាព" },
    { command: "deletemydata", description: "លុបទិន្នន័យរបស់ខ្ញុំ" },
  ],
};

/** Extra command only the owner sees in the menu (Spec 3.2). */
export const ownerCommands: Record<Lang, { command: string; description: string }[]> = {
  en: [...commands.en, { command: "stats", description: "Usage stats (owner)" }],
  km: [...commands.km, { command: "stats", description: "ស្ថិតិការប្រើប្រាស់ (ម្ចាស់)" }],
};

// ---------- Milestone 3: feeling → songs ----------

export const listening: Record<Lang, string> = {
  km: "🎧 កំពុងស្តាប់...",
  en: "🎧 Listening...",
};

const MOOD_EMOJI: Record<Mood, string> = {
  sad: "💙",
  happy: "🌞",
  angry: "🌿",
  missing: "🌙",
  love: "💕",
  lonely: "🤍",
  stressed: "🍃",
  calm: "☁️",
};

const SONGS_HEADING: Record<Lang, string> = {
  km: "បទចម្រៀងសម្រាប់អ្នក",
  en: "Songs for you",
};

function songLines(songs: { title: string; artist: string }[]): string[] {
  return songs.map(
    (s, i) =>
      `${i + 1}. 🎵 <a href="${escapeHtml(youtubeSearchUrl(s.title, s.artist))}">${escapeHtml(s.title)}</a> — ${escapeHtml(s.artist)}`,
  );
}

/** Comfort line + 3 songs as YouTube search links (Flow B step 5–6). */
export function songResult(r: {
  mood: Mood;
  language: Lang;
  comfort: string;
  songs: { title: string; artist: string }[];
}): string {
  return [
    `${MOOD_EMOJI[r.mood]} ${escapeHtml(r.comfort)}`,
    ``,
    `<b>${SONGS_HEADING[r.language]}</b>`,
    ...songLines(r.songs),
  ].join("\n");
}

// ---------- Milestone 5: buttons ----------

const MORE_HEADING: Record<Lang, string> = {
  km: "បទផ្សេងទៀតសម្រាប់អ្នក",
  en: "More songs for you",
};

/** A new batch after 🔄 or 👎 (Flow C). */
export function moreSongsResult(lang: Lang, songs: { title: string; artist: string }[]): string {
  return [`🔄 <b>${MORE_HEADING[lang]}</b>`, ...songLines(songs)].join("\n");
}

export const buttonTexts = {
  thanks: { km: "អរគុណ! រីករាយស្តាប់ 🎧", en: "Thanks! Enjoy 🎧" },
  askLanguage: {
    km: "សុំទោសដែលបទមិនត្រូវចិត្ត 🙏 ចង់បានបទខ្មែរ ឬបទអង់គ្លេស?",
    en: "Sorry those didn't fit 🙏 Would you like Khmer songs or English songs?",
  },
  khmer: { km: "🇰🇭 បទខ្មែរ", en: "🇰🇭 Khmer" },
  english: { km: "🇬🇧 បទអង់គ្លេស", en: "🇬🇧 English" },
  searching: { km: "🎧 កំពុងស្វែងរកបទថ្មី...", en: "🎧 Finding new songs..." },
  limit: {
    km: "លើកនេះអស់បទថ្មីហើយ។ សូមប្រាប់អារម្មណ៍ម្តងទៀត ដើម្បីទទួលបទថ្មី។",
    en: "No more new songs for this one. Tell me how you feel again to get new songs.",
  },
  noSongs: {
    km: "មិនមានបទខ្មែរថ្មីសម្រាប់អារម្មណ៍នេះទៀតទេ។ សាកជ្រើសបទអង់គ្លេសវិញ។",
    en: "No new Khmer songs left for this mood. Try English songs instead.",
  },
  expired: {
    km: "សារនេះចាស់ហើយ។ សូមប្រាប់អារម្មណ៍ម្តងទៀត។",
    en: "This message is too old. Please tell me how you feel again.",
  },
} satisfies Record<string, Record<Lang, string>>;

export const errors = {
  tooShort: {
    km: "សូមសរសេរប្រាប់ពីអារម្មណ៍របស់អ្នកឱ្យវែងជាងនេះបន្តិច 🙂",
    en: "Please tell me a little more about how you feel 🙂",
  },
  tooLong: (max: number): Record<Lang, string> => ({
    km: `សារនេះវែងពេក។ សូមសរសេរឱ្យខ្លីជាង ${max} តួអក្សរ។`,
    en: `That message is too long. Please keep it under ${max} characters.`,
  }),
  voiceTooLong: (maxSeconds: number): Record<Lang, string> => ({
    km: `Voice នេះវែងពេក។ សូមផ្ញើ voice ដែលមិនលើស ${maxSeconds} វិនាទី ឬវាយអក្សរវិញ។`,
    en: `That voice note is too long. Please send one under ${maxSeconds} seconds, or type instead.`,
  }),
  voiceTooBig: {
    km: "ឯកសារ voice នេះធំពេក។ សូមថតខ្លីជាងនេះ ឬវាយអក្សរវិញ។",
    en: "That voice file is too large. Please record a shorter one, or type instead.",
  },
  voiceUnclear: {
    km: "សុំទោស ខ្ញុំស្តាប់មិនសូវច្បាស់ទេ។ សូមថតម្តងទៀតនៅកន្លែងស្ងាត់ ឬវាយអក្សរប្រាប់ខ្ញុំ 🙏",
    en: "Sorry, I couldn't hear that clearly. Please record again somewhere quiet, or type instead 🙏",
  },
  failed: {
    km: "សុំទោស ពេលនេះខ្ញុំមិនអាចស្វែងរកបទចម្រៀងបានទេ។ សូមព្យាយាមម្តងទៀតបន្តិចទៀត 🙏",
    en: "Sorry, I couldn't find songs right now. Please try again in a little while 🙏",
  },
  busy: {
    km: "ពេលនេះមានអ្នកប្រើច្រើនពេក។ សូមព្យាយាមម្តងទៀតក្រោយពីនេះបន្តិច 🙏",
    en: "Lots of people are using the bot right now. Please try again a bit later 🙏",
  },
} satisfies Record<string, Record<Lang, string> | ((n: number) => Record<Lang, string>)>;

// ---------- Milestone 6: limits, other message types, safety ----------

export const limitTexts = {
  daily: (limit: number): Record<Lang, string> => ({
    km: `ថ្ងៃនេះអ្នកបានប្រើគ្រប់ ${limit} ដងហើយ។ សូមត្រឡប់មកវិញថ្ងៃស្អែក 🌙`,
    en: `You've used all ${limit} tries for today. Please come back tomorrow 🌙`,
  }),
  cooldown: (seconds: number): Record<Lang, string> => ({
    km: `សូមរង់ចាំ ${seconds} វិនាទីទៀត សិនណា 🙏`,
    en: `Please wait ${seconds} more seconds 🙏`,
  }),
  unsupported: {
    km: "ខ្ញុំយល់តែ voice ឬអក្សរប៉ុណ្ណោះ។ សូមផ្ញើ voice ឬវាយអក្សរប្រាប់ពីអារម្មណ៍របស់អ្នក 🎤✍️",
    en: "I can only understand voice notes or text. Please send a voice note or type how you feel 🎤✍️",
  },
  unknownCommand: {
    km: "ខ្ញុំមិនស្គាល់ពាក្យបញ្ជានេះទេ។ សូមចុច /help ដើម្បីមើលរបៀបប្រើ។",
    en: "I don't know that command. Tap /help to see how to use me.",
  },
} satisfies Record<string, Record<Lang, string> | ((n: number) => Record<Lang, string>)>;

/**
 * Shown instead of songs when the user may be at risk (Spec 6.3).
 * TPO numbers and hours from TPO's own site (checked 2026-11-22):
 *   tpocambodia.org/getting-help/ → 023 63 66 991, Mon–Fri 8–12 & 1–4
 *   tpocambodia.org/contact-us/   → Treatment Center 016 222 597 & 095 777 004, Mon–Sun 8–12 & 1–4
 * Child Helpline Cambodia 1280: free, 24 h, up to age 25. Emergency: 119 ambulance, 117 police.
 */
export const safetyMessage: Record<Lang, string> = {
  km: [
    "💙 សូមអរគុណដែលបានប្រាប់ខ្ញុំ។ ស្តាប់ទៅដូចជាអ្នកកំពុងឈឺចាប់ខ្លាំងណាស់ ហើយអ្នកមិនចាំបាច់ទ្រាំតែម្នាក់ឯងទេ។",
    "",
    "សូមនិយាយជាមួយមនុស្សដែលអ្នកទុកចិត្តនៅពេលនេះ ដូចជាគ្រួសារ ឬមិត្តភក្តិ។ អ្នកក៏អាចទូរស័ព្ទរកអ្នកប្រឹក្សាដែលអាចជួយអ្នកបាន៖",
    "",
    "📞 បណ្តាញទូរស័ព្ទជំនួយកុមារ (អាយុរហូតដល់ 25 ឆ្នាំ, 24 ម៉ោង, ឥតគិតថ្លៃ)៖ <b>1280</b>",
    "📞 TPO Cambodia (សុខភាពផ្លូវចិត្ត)៖ <b>023 63 66 991</b> (ច័ន្ទ–សុក្រ, 8–12 ព្រឹក និង 1–4 រសៀល)",
    "🏥 មណ្ឌលព្យាបាល TPO៖ <b>016 222 597</b> ឬ <b>095 777 004</b> (រៀងរាល់ថ្ងៃ, 8–12 ព្រឹក និង 1–4 រសៀល)",
    "🚨 បើមានគ្រោះថ្នាក់ភ្លាមៗ៖ <b>119</b> (រថយន្តសង្គ្រោះ) ឬ <b>117</b> (ប៉ូលិស)",
    "",
    "អ្នកសំខាន់ណាស់។ អ្នកអាចផ្ញើសារមកខ្ញុំម្តងទៀតពេលណាក៏បាន។",
  ].join("\n"),
  en: [
    "💙 Thank you for telling me. It sounds like you're in a lot of pain, and you don't have to carry this alone.",
    "",
    "Please reach out to someone you trust right now, like family or a friend. You can also call people who can help:",
    "",
    "📞 Child Helpline Cambodia (up to age 25, 24 hours, free): <b>1280</b>",
    "📞 TPO Cambodia (mental health): <b>023 63 66 991</b> (Mon–Fri, 8am–12pm and 1–4pm)",
    "🏥 TPO Treatment Center: <b>016 222 597</b> or <b>095 777 004</b> (every day, 8am–12pm and 1–4pm)",
    "🚨 In immediate danger: <b>119</b> (ambulance) or <b>117</b> (police)",
    "",
    "You matter. You can message me again any time.",
  ].join("\n"),
};

// ---------- Milestone 7: /deletemydata ----------

export const deleteTexts = {
  confirm: {
    km: "តើអ្នកចង់លុបទិន្នន័យទាំងអស់ដែលខ្ញុំរក្សាអំពីអ្នកមែនទេ? (ឈ្មោះ ភាសា ប្រវត្តិអារម្មណ៍ បទដែលបានណែនាំ និងការចុច 👍/👎)\n\n⚠️ ការលុបនេះមិនអាចយកមកវិញបានទេ។",
    en: "Do you want to delete everything I keep about you? (name, language, mood history, recommended songs and 👍/👎)\n\n⚠️ This cannot be undone.",
  },
  yes: { km: "🗑 លុប", en: "🗑 Delete" },
  no: { km: "បោះបង់", en: "Cancel" },
  done: {
    km: "✅ ទិន្នន័យរបស់អ្នកត្រូវបានលុបហើយ។ ប្រសិនបើអ្នកផ្ញើសារមកម្តងទៀត ខ្ញុំនឹងចាប់ផ្តើមពីដំបូង។",
    en: "✅ Your data has been deleted. If you message me again, I'll start fresh.",
  },
  cancelled: { km: "បានបោះបង់។ មិនមានអ្វីត្រូវបានលុបទេ។", en: "Cancelled. Nothing was deleted." },
} satisfies Record<string, Record<Lang, string>>;
