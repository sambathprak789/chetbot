-- ChetBot initial schema (Spec Stage 5)

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,              -- Telegram user ID
  first_name  TEXT    NOT NULL DEFAULT '',
  language    TEXT    NOT NULL DEFAULT 'km' CHECK (language IN ('km', 'en')),
  daily_count INTEGER NOT NULL DEFAULT 0,
  daily_date  TEXT,                             -- YYYY-MM-DD (UTC+7)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  title  TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  artist TEXT    NOT NULL CHECK (length(trim(artist)) > 0),
  moods  TEXT    NOT NULL,                      -- e.g. 'sad,missing'
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (title, artist)
);

CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  input_type TEXT    NOT NULL CHECK (input_type IN ('voice', 'text')),
  mood       TEXT    NOT NULL,
  language   TEXT    NOT NULL CHECK (language IN ('km', 'en')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests (user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests (created_at);

CREATE TABLE IF NOT EXISTS recommendations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  song_id    INTEGER REFERENCES songs (id),     -- NULL for AI-picked English songs
  title      TEXT    NOT NULL,
  artist     TEXT    NOT NULL,
  batch      INTEGER NOT NULL DEFAULT 1,
  feedback   TEXT    CHECK (feedback IN ('like', 'dislike')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recs_request ON recommendations (request_id);
