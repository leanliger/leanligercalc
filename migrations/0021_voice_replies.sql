-- Voice replies to check-ins (worker/voice-replies.ts): the coach records or
-- uploads up to 30 seconds of audio, kept in the PHOTOS bucket under
-- voice/<member>/<week>-<id>. A new one replaces the old; "Delete all my data"
-- removes them.
ALTER TABLE checkins ADD COLUMN reply_audio TEXT;          -- R2 object key
ALTER TABLE checkins ADD COLUMN reply_audio_type TEXT;     -- e.g. audio/webm, audio/mp4
ALTER TABLE checkins ADD COLUMN reply_audio_seconds REAL;
