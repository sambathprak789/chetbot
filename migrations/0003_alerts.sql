-- Milestone 7: throttle error alerts to the owner (Spec 7.4: at most 1 message per 10 minutes)
CREATE TABLE IF NOT EXISTS alerts (
  key          TEXT PRIMARY KEY,
  last_sent_at INTEGER NOT NULL                -- Unix time in ms
);
