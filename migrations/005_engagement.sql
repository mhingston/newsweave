ALTER TABLE digests ADD COLUMN IF NOT EXISTS resend_email_id TEXT;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS opened_count INTEGER;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS unique_opened_count INTEGER;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS clicked_count INTEGER;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS unique_clicked_count INTEGER;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS engagement_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS digests_resend_email_id_idx ON digests (resend_email_id);
