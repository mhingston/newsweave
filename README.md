# Newsweave

Newsweave turns a Miniflux collection into one curated daily email. It polls
Miniflux hourly, expands configured digest feeds into child links, fetches
content through Fabric-supported extractors, summarises items with one text
model request, groups related coverage, selects at most 50 stories with no more
than 5 stories from one feed, and sends the result through Resend.

The project is intentionally separate from PNIP and uses its own PostgreSQL
database (`newsweave`).

Fabric is installed separately and should be kept current with the official
installer. The verified host version is currently `1.4.467`.

## Commands

```text
newsweave ingest       Poll Miniflux and queue new source items
newsweave process      Fetch and summarise pending items
newsweave publish      Curate and send the daily email
newsweave retention    Delete items older than the retention window
newsweave doctor       Check configuration and integrations
newsweave candidates   Report likely digest/fan-out feeds for review
newsweave metrics      Show item and latest-digest counts
```

## Initial configuration

Copy `.env.example` to `.env`, set the credentials, and ensure the URL points
to the separate `newsweave` database.

```dotenv
DATABASE_URL=postgres://...
MINIFLUX_URL=http://127.0.0.1:8080
MINIFLUX_API_TOKEN=...
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=...
AI_MODEL=...
RESEND_API_KEY=...
EMAIL_FROM=Newsweave <news@example.com>
EMAIL_TO=you@example.com
TIMEZONE=Europe/London
PUBLICATION_TIME=06:00
RETENTION_DAYS=7
FABRIC_BIN=fabric
FANOUT_FEED_IDS=1,230,228,179
```

`FANOUT_FEED_IDS` and `FANOUT_FEED_TITLES` are comma-separated. Feed titles
are matched case-insensitively. Configure a feed as fan-out only after checking
the candidate report; ordinary feed entries remain first-class items.

## Curation

Newsweave processes every eligible item, then groups related coverage before
selecting what appears in the email. Selection is ranked by the story-group
score, capped at 50 story groups per edition, and capped at 5 selected groups
per feed. Items reviewed but suppressed are recorded as excluded from that
digest and remain available for the 7-day retention period.

The ranking policy and safe adjustment points are documented in
[`docs/curation-policy.md`](docs/curation-policy.md). Preference learning from
email opens or clicks is intentionally deferred; Miniflux feed selection is
the current explicit preference signal.

YouTube Shorts are excluded at ingestion and processing time. Standard
YouTube videos remain supported through Fabric/yt-dlp extraction.

## Scheduling

Use cron or systemd timers to run `newsweave ingest` and `newsweave process`
hourly, `newsweave publish` at 06:00 Europe/London, and `newsweave retention`
daily. Each command takes a PostgreSQL advisory lock, so missed or overlapping
invocations are safe to retry. See [`scripts/cron.example`](scripts/cron.example)
for a starting point; schedules are not installed automatically.
