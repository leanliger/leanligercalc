-- Every coach's daily digest, kept by date for the dashboard (Today → Daily
-- digests; worker/digest.ts), with what happened to its Whop notification:
-- sent | sent-community (Whop refused the team route, sent through the
-- community instead) | off (notifications switched off) | nothing (nothing
-- needed them) | failed: <Whop's reason, never the API key>.
CREATE TABLE coach_digest_log (
  company_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,               -- yyyy-mm-dd in the coach's time zone
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, user_id, date)
);
