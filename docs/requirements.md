# Newsweave — RSS Curation and Digest System

Status: requirements captured; implementation in progress

Project conventions:

- Project directory: `/opt/newsweave`
- PostgreSQL database: `newsweave`
- Main command: `newsweave`
- Daily email name: `Newsweave Daily`

## Purpose

Create a small, reliable system that reads all Miniflux feeds, expands digest-style feed entries into child links, summarises eligible items, curates related coverage, and sends one daily email digest.

## Agreed requirements

- Miniflux remains the RSS aggregator and reading application.
- The new system ingests all Miniflux feeds; categories are retained as metadata, not used as an ingestion allow-list.
- The system checks Miniflux hourly for new entries.
- A daily digest is generated at a fixed local time, defaulting to 06:00.
- Entries received after publication are included in the next day's digest.
- Ordinary RSS entries are first-class summarisation items.
- Some feeds are explicitly configured as fan-out feeds. Ben's Bites is a confirmed initial candidate.
- The system should produce a review report identifying likely fan-out candidates using link count, newsletter/digest language, external-domain diversity, and link-heavy content signals.
- Fan-out extracts every valid external child link; there is no editorial per-entry link limit.
- Child links are fetched and summarised like ordinary RSS items, then curated alongside them.
- A parent digest is retained as context/provenance but is not separately summarised by default.
- Direct and fan-out copies of the same article are deduplicated where possible, while retaining all source references.
- Fan-out discoveries appear in a separate section of the email digest, with attribution to the parent digest.
- Failed child links are recorded and retried; the parent remains usable.
- Repeatedly failed summarisation items are marked failed and do not block publication.
- Each successful item receives one concise paragraph and 3–5 key points with a source link.
- Curation considers relevance, source quality, novelty, and reader interest, not recency alone.
- Deterministic URL/source deduplication happens before AI grouping of genuinely related stories.
- The first release sends email only.
- PostgreSQL is used for persistence and simple full-text search.
- Fetched content, summaries, source metadata, and parent/child provenance are retained for auditability.
- Entire items are deleted after 7 days; retention cleanup is mandatory and scheduled.
- The AI integration should be deliberately simple: one configured provider/model, one summarisation request per item, structured output, bounded retries, and an explicit failed state. Optional fallback providers remain an open design question.
- Fan-out accepts HTTP/HTTPS article links while filtering obvious navigation, unsubscribe, social-profile, media-download, and tracking links.
- Child items inherit the parent's feed/category metadata while also recording the child's actual publisher/domain.
- Email ordering is top stories first, ordinary coverage second, and fan-out discoveries third.
- The email includes up to 50 selected story groups, with a ranked Top Stories section first.
- No more than 5 selected story groups may come from the same feed.
- Selection happens after summarisation and grouping; low-ranked groups are suppressed from the email but remain retained until normal retention cleanup.
- The initial ranking policy is documented in `docs/curation-policy.md`; it is intentionally deterministic at the selection stage and does not use email engagement signals.
- Related items are rendered as one combined story with a headline, summary, key points, and supporting links.
- The AI configuration targets an OpenAI-compatible text API using `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
- YouTube processing is extraction-first: Fabric/yt-dlp retrieves transcript and metadata, and the text model summarises the resulting text. The AI model does not generate or analyse video directly.
- YouTube Shorts are excluded from ingestion/processing; standard YouTube videos remain eligible.
- If a YouTube transcript is unavailable, use the video title and description as the summarisation input.
- Support a single summarisation request for transcripts up to an approximately 1 million-token context window; do not add timestamp output.
- The first release supports any URL that the configured Fabric extractor supports.
- Email delivery uses Resend.
- Preference learning is deferred. Miniflux feed selection is the primary explicit preference signal; Resend opens, clicks, and non-clicks are not used for ranking in the first curation release.
- Operations provide a daily run summary and failure counts.
- Fabric CLI is maintained through the official installer; it is now v1.4.467 (released 2026-07-31).
- Build the replacement as a clean implementation in a new directory; leave PNIP intact during development and evaluation.
- Use a separate PostgreSQL database so the replacement cannot affect PNIP data.
- If no successful items are available, do not send an empty email; record a no-digest run instead.
- Implement in TypeScript/Node.js.
- Use scheduled commands rather than a continuously running service: hourly ingestion, daily publication at 06:00 Europe/London, and scheduled retention cleanup.
- Scheduled commands must use database/advisory locking so overlapping runs are safe.

## Initial non-requirements

- No embeddings or vector search.
- No per-chunk enrichment pipeline.
- No entity, topic, or quality-classification jobs.
- No NotebookLM or podcast generation.
- No web UI in the first release.
- No multi-edition publication workflow.

## Open questions

- Exact fan-out link validation and filtering rules.
- Whether child summaries should inherit or override the parent's feed/category metadata.
- Email layout, ordering, and digest size.
- AI provider/model and structured-output contract.
- Retry timing and operational alerts.
- Whether 7-day deletion should be configurable while retaining 7 days as the default.

## Live fan-out review (2026-08-01)

The first Newsweave candidate report identified these feeds for human review:

- Activated: Ben's Bites (feed 1), The Pragmatic Engineer newsletter (feed 230), ByteByteGo Newsletter (feed 228), and Daniel Miessler (feed 179).
- Remaining candidates to review: Ed Zitron's Where's Your Ed At, Latent Space: The AI Engineer Podcast, Simon Willison's Weblog, and Hamel's Blog.

Candidate detection is advisory and does not automatically change feed
behaviour; the four feeds above were explicitly activated.
