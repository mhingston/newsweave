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
newsweave engagement   Poll Resend for digest-level opens and clicks
newsweave retention    Delete items older than the retention window
newsweave doctor       Check configuration and integrations
newsweave candidates   Report likely digest/fan-out feeds for review
newsweave metrics      Show item and latest-digest counts
newsweave downvote URL  Mark an item as not interested for future editions
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

Mixed feeds — digests some days, essays or announcements on others — can be
listed in `FANOUT_CANDIDATE_FEED_IDS` / `FANOUT_CANDIDATE_FEED_TITLES`
instead. Every entry from a candidate feed is tested individually and only
becomes fan-out when it carries at least `FANOUT_MIN_LINKS` outbound article
links (default 5) spanning at least `FANOUT_MIN_DOMAINS` distinct domains
(default 3); everything else stays an ordinary item. Feeds on neither list are
never expanded, so link-heavy but non-digest blogs remain safe.

## Curation

Newsweave processes every eligible item, then groups related coverage before
selecting what appears in the email. Selection is ranked by the story-group
score, capped at 50 story groups per edition, and capped at 5 selected groups
per feed. Items reviewed but suppressed are recorded as excluded from that
digest and remain available for the 7-day retention period.

The ranking policy and safe adjustment points are documented in
[`docs/curation-policy.md`](docs/curation-policy.md).

An optional typed decision layer can be enabled with
`DECISION_MODEL_ENABLED=true`. It uses
[`@mhingston5/jev-cli`](https://github.com/mhingston/jev-cli), so provider
selection remains independent of Newsweave: TypeSafe, OpenRouter, Vercel,
Cloudflare, or any compatible `/v1/systemone` service can be selected through
the normal `JEV_*` / provider credential environment variables.

When enabled, the decision layer re-ranks the text model's story groups using
explicit editorial judgments and, by default, performs a final semantic
same-event check. If two groups from different sources are judged to describe
the same specific event above `DECISION_MODEL_DUPLICATE_THRESHOLD`, the lower
ranked group is merged into the higher ranked group so its source links are
preserved rather than emitted as a duplicate story. Decision calls fail open:
ranking keeps the existing score and dedupe keeps groups separate when the
decision service is unavailable.

Engagement polling is supported without webhooks: Newsweave stores each Resend email ID and the
`engagement` command polls Resend's Email Metrics API for digest-level opens and
clicks. These metrics are observational for now; transactional-email metrics do
not provide per-story link breakdowns for these sends.

To exclude a specific item from future editions, use its title URL:

```sh
npm start -- downvote https://example.com/story
```

Downvotes affect future editions only; they do not rewrite emails already sent.

YouTube Shorts are excluded at ingestion and processing time. Standard
YouTube videos remain supported through Fabric/yt-dlp extraction.
Videos with missing placeholder titles, bot-check pages, or metadata-only
responses are also excluded rather than summarised.

## Scheduling

Use cron or systemd timers to run `newsweave ingest` and `newsweave process`
hourly, `newsweave publish` at 06:00 Europe/London, and `newsweave retention`
daily. Each command takes a PostgreSQL advisory lock, so missed or overlapping
invocations are safe to retry. See [`scripts/cron.example`](scripts/cron.example)
for a starting point; schedules are not installed automatically.
