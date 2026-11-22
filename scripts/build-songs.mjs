// Usage: node scripts/build-songs.mjs  →  reads seed/songs.csv, writes seed/songs.sql
import { readFileSync, writeFileSync } from "node:fs";
import { buildSongsSql, parseCsv, validateSongs } from "./songs-csv.mjs";

const root = new URL("../", import.meta.url);
const moods = JSON.parse(readFileSync(new URL("src/moods.json", root), "utf8"));
const csv = readFileSync(new URL("seed/songs.csv", root), "utf8");

const { songs, errors } = validateSongs(parseCsv(csv), moods);
if (errors.length) {
  console.error(`songs.csv has ${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

writeFileSync(new URL("seed/songs.sql", root), buildSongsSql(songs), "utf8");

const perMood = Object.fromEntries(moods.map((m) => [m, 0]));
for (const s of songs) for (const m of s.moods.split(",")) perMood[m]++;
console.log(`Wrote seed/songs.sql with ${songs.length} songs.`);
console.log("Songs per mood:", perMood);
const thin = moods.filter((m) => perMood[m] < 12);
if (thin.length)
  console.warn(`Warning: fewer than 12 songs for: ${thin.join(", ")} (🔄 may run out)`);
