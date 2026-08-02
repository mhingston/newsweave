CREATE TABLE IF NOT EXISTS digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('no_digest', 'sent', 'failed')),
  subject TEXT,
  html TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);

CREATE TABLE IF NOT EXISTS digest_items (
  digest_id UUID NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (digest_id, item_id)
);
