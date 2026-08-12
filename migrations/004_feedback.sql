CREATE TABLE IF NOT EXISTS item_feedback (
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  feedback_kind TEXT NOT NULL CHECK (feedback_kind IN ('downvote')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, feedback_kind)
);
