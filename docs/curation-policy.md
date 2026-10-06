# Newsweave curation policy

This is the operator and agent guide for adjusting digest selection. It keeps
curation small and explainable.

## Current pipeline

1. Ingest and summarise all eligible items.
2. Ask the text model to group items covering the same underlying event and
   produce the combined headline/summary/key points.
3. When `DECISION_MODEL_ENABLED=true`, use `@mhingston5/jev-cli` to
   re-score each group against explicit editorial questions. Otherwise retain
   the text-model score.
4. When decision dedupe is enabled, compare plausible cross-source duplicate
   groups and merge a lower-ranked group into the higher-ranked group when the
   same-event probability meets the configured threshold.
5. Sort groups by descending score, with the headline as a stable tie-breaker.
6. Select at most 50 groups per edition.
7. Select at most 5 groups from any one feed. A group containing multiple
   feeds consumes one slot from each member feed.
8. Record selected items as `included=true` and reviewed-but-suppressed items
   as `included=false` in `digest_items`. Both remain subject to retention.

Extractor error pages, including anti-abuse/SSRF block responses, are not
valid content. They are retried and eventually marked failed rather than being
summarised as stories.

When grouping falls back to singleton stories, the score is currently:

```text
0.7 × relevance + 0.3 × novelty
```

## Optional decision layer

Decision ranking uses three normalized score questions — editorial-policy
match, substantive information, and consequence — weighted 0.55 / 0.30 / 0.15.
A promotional-probability judgment applies a bounded penalty. The default
editorial policy can be overridden through `DECISION_EDITORIAL_POLICY`.

Semantic dedupe is deliberately a second line of defence after deterministic
URL/source dedupe and the text model's grouping. A cheap lexical prefilter
avoids all-pairs decision calls. Plausible matches are sent to one typed
`noul` question asking whether they cover the same *specific* event,
announcement, release, incident, or development. A positive match merges item
IDs into the higher-ranked group, retaining all source links.

Both ranking and dedupe fail open. A provider failure must not suppress a story
or prevent publication.

## Safe adjustment points

- Change the hard limits in `src/selection.ts` only when the requirements and
  selection tests are updated together.
- Change the singleton weights in `src/curate.ts` when relevance versus
  novelty needs recalibration.
- Change the model’s grouping instructions in `src/curate.ts` when the
  definition of same-event coverage changes.
- Change typed decision questions or weights in `src/decision.ts` when the
  editorial definition of a high-value story changes.
- If feed-specific boosts are introduced later, keep them bounded and
  explicit. Apply them before the per-feed cap, and do not let them override
  relevance entirely.

Do not use email opens, ignored stories, or delivery events as negative
preference signals. Miniflux’s selected feeds are the current explicit
preference model.

Any ranking change should include a deterministic unit test and a dry-run
against representative summaries. Do not send an email merely to test ranking.
