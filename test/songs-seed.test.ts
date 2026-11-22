import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS helper shared with the Node build script
import { buildSongsSql, parseCsv, validateSongs } from "../scripts/songs-csv.mjs";
import { isMood, MOODS } from "../src/moods";

const header = "title,artist,moods,check\n";

describe("songs.csv parsing", () => {
  it("handles BOM, quotes, CRLF and Khmer text", () => {
    const rows = parseCsv(
      "﻿" + header + 'ចំប៉ាបាត់ដំបង,ស៊ីន ស៊ីសាមុត,"missing,calm",\r\n"A ""B""",C,sad,\r\n',
    );
    expect(rows).toEqual([
      ["title", "artist", "moods", "check"],
      ["ចំប៉ាបាត់ដំបង", "ស៊ីន ស៊ីសាមុត", "missing,calm", ""],
      ['A "B"', "C", "sad", ""],
    ]);
  });

  it("reports empty fields, unknown moods and duplicates", () => {
    const { errors } = validateSongs(
      parseCsv(header + ",X,sad\nY,,happy\nZ,W,joyful\nZ,w,sad\nz ,W,sad\n"),
      MOODS,
    );
    expect(errors).toEqual([
      "line 2: title is empty",
      "line 3: artist is empty",
      "line 4: unknown mood(s) joyful",
      "line 5: duplicate of line 4 (Z — w)",
      "line 6: duplicate of line 4 (z — W)",
    ]);
  });

  it("accepts ; or | as mood separators and removes repeats", () => {
    const { songs, errors } = validateSongs(parseCsv(header + "T,A,sad;Missing|sad\n"), MOODS);
    expect(errors).toEqual([]);
    expect(songs[0].moods).toBe("sad,missing");
  });
});

describe("songs.sql in D1", () => {
  it("inserts, updates moods and deactivates removed songs", async () => {
    const run = async (csv: string) => {
      const { songs, errors } = validateSongs(parseCsv(header + csv), MOODS);
      expect(errors).toEqual([]);
      const sql: string = buildSongsSql(songs);
      for (const stmt of sql.split("\n").filter((l) => l && !l.startsWith("--"))) {
        await env.DB.prepare(stmt).run();
      }
    };
    await run("Song's One,A,sad\nTwo,B,happy\n");
    await run('Song\'s One,A,"sad,lonely"\n');

    const rows = await env.DB.prepare(
      "SELECT title, moods, active FROM songs ORDER BY title",
    ).all();
    expect(rows.results).toEqual([
      { title: "Song's One", moods: "sad,lonely", active: 1 },
      { title: "Two", moods: "happy", active: 0 },
    ]);
  });
});

describe("moods", () => {
  it("has the 8 spec moods", () => {
    expect(MOODS).toHaveLength(8);
    expect(isMood("calm")).toBe(true);
    expect(isMood("joyful")).toBe(false);
  });
});
