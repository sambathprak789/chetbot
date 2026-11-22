import type { Lang } from "../messages";

/**
 * Create the user on first contact, refresh first_name afterwards.
 * Returns the stored language (new users get `defaultLang`).
 */
export async function upsertUser(
  db: D1Database,
  user: { id: number; firstName: string; defaultLang: Lang },
): Promise<Lang> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, first_name, language) VALUES (?1, ?2, ?3)
       ON CONFLICT (id) DO UPDATE SET first_name = excluded.first_name
       RETURNING language`,
    )
    .bind(user.id, user.firstName, user.defaultLang)
    .first<{ language: Lang }>();
  return row?.language ?? user.defaultLang;
}

/** Remember the language the user last spoke (Spec 5.2 users.language). */
export async function setUserLanguage(db: D1Database, id: number, language: Lang): Promise<void> {
  await db.prepare("UPDATE users SET language = ?2 WHERE id = ?1").bind(id, language).run();
}
