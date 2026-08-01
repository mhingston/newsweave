# Newsweave architecture

```text
Miniflux
   │ hourly poll
   ▼
RSS entries ── configured fan-out feeds ──► child links
   │                                          │
   └──────────────────────┬───────────────────┘
                          ▼
             deterministic URL deduplication
                          ▼
                 Fabric content extraction
                          ▼
             one text-model summary per item
                          ▼
           deterministic dedup + AI story grouping
                          ▼
                    daily email via Resend
```

The durable unit is an item, not a multi-stage document/chunk graph. An item
may have one or more Miniflux source references and an optional parent digest
reference. Fan-out children inherit the parent's feed/category metadata while
retaining their actual URL and publisher.

Processing is idempotent. PostgreSQL advisory locks prevent overlapping command
runs. Failed items do not block publication. Items and all associated content,
summaries, and provenance are removed after the configured retention period,
which defaults to seven days.
