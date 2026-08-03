# Newsweave curation policy

This is the operator and agent guide for adjusting digest selection. It keeps
curation small and explainable.

## Current pipeline

1. Ingest and summarise all eligible items.
2. Ask the text model to summarise in English and group items covering the
   same underlying event, assigning each group a score from 0 to 1.
3. Sort groups by descending score, with the headline as a stable tie-breaker.
4. Select at most 50 groups per edition.
5. Select at most 5 groups from any one feed. A group containing multiple
   feeds consumes one slot from each member feed.
6. Record selected items as `included=true` and reviewed-but-suppressed items
   as `included=false` in `digest_items`. Both remain subject to retention.

When grouping falls back to singleton stories, the score is currently:

```text
0.7 × relevance + 0.3 × novelty
```

## Safe adjustment points

- Change the hard limits in `src/selection.ts` only when the requirements and
  selection tests are updated together.
- Change the singleton weights in `src/curate.ts` when relevance versus
  novelty needs recalibration.
- Change the model’s grouping and scoring instructions in `src/curate.ts`
  when the editorial definition of a high-value story changes.
- If feed-specific boosts are introduced later, keep them bounded and
  explicit. Apply them before the per-feed cap, and do not let them override
  relevance entirely.

Do not use email opens, ignored stories, or delivery events as negative
preference signals. Miniflux’s selected feeds are the current explicit
preference model.

Any ranking change should include a deterministic unit test and a dry-run
against representative summaries. Do not send an email merely to test ranking.
