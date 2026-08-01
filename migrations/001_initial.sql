CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ingestion_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_entry_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  miniflux_entry_id BIGINT NOT NULL UNIQUE,
  feed_id BIGINT NOT NULL,
  feed_title TEXT NOT NULL,
  category_title TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content_html TEXT,
  published_at TIMESTAMPTZ,
  is_fanout BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'fanout')),
  parent_source_entry_id UUID REFERENCES source_entries(id) ON DELETE SET NULL,
  feed_id BIGINT NOT NULL,
  feed_title TEXT NOT NULL,
  category_title TEXT,
  publisher_host TEXT,
  content_html TEXT,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'summarized', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_sources (
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source_entry_id UUID NOT NULL REFERENCES source_entries(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (item_id, source_entry_id)
);

CREATE TABLE IF NOT EXISTS run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'no_digest')),
  stats JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS items_status_idx ON items(status, created_at);
CREATE INDEX IF NOT EXISTS items_fts_idx ON items USING GIN (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, ''))
);
