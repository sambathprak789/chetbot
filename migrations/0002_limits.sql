-- Milestone 6: cooldown and global Gemini limit (Spec 6.4)

-- Unix time in ms of the user's last accepted request (cooldown)
ALTER TABLE users ADD COLUMN last_request_at INTEGER;

-- Gemini calls per Pacific-time day (Gemini's free quota resets at midnight Pacific)
CREATE TABLE IF NOT EXISTS daily_usage (
  day          TEXT PRIMARY KEY,               -- YYYY-MM-DD (America/Los_Angeles)
  gemini_calls INTEGER NOT NULL DEFAULT 0
);
