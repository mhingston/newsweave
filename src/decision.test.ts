import { describe, expect, it } from "vitest";
import type { SystemOneLikeClient, SystemOneRequest, SystemOneResponse } from "@mhingston5/jev-cli";
import { loadConfig } from "./config.js";
import type { CuratableItem, StoryGroup } from "./curate.js";
import { applyDecisionModel, dedupeWithDecisionModel, rankWithDecisionModel } from "./decision.js";

const baseEnv = {
  DATABASE_URL: "postgres://user:pass@localhost/newsweave",
  MINIFLUX_URL: "http://localhost:8080",
  MINIFLUX_API_TOKEN: "token",
  AI_BASE_URL: "https://example.com/v1",
  AI_API_KEY: "ai-key",
  AI_MODEL: "model",
  RESEND_API_KEY: "resend",
  EMAIL_FROM: "Newsweave <news@example.com>",
  EMAIL_TO: "reader@example.com",
};

function config(extra: Record<string, string> = {}) {
  return loadConfig({
    ...baseEnv,
    DECISION_MODEL_ENABLED: "true",
    ...extra,
  });
}

const item = (id: string, title: string, feedId = "feed"): CuratableItem => ({
  id,
  feedId,
  feedTitle: feedId,
  title,
  url: `https://example.com/${id}`,
  kind: "rss",
  summary: { summary: title, keyPoints: ["one", "two", "three"], relevance: 0.5, novelty: 0.5 },
});

const group = (id: string, headline: string, score = 0.5): StoryGroup => ({
  itemIds: [id],
  headline,
  summary: headline,
  keyPoints: ["one", "two", "three"],
  score,
});

function scoreAnswer(value: number) {
  return {
    type: "score" as const,
    score: value,
    confidence: 1,
    legend: { "0": "low", "1": "moderate", "2": "high", "3": "essential" },
    probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
  };
}

class FakeClient implements SystemOneLikeClient {
  calls: SystemOneRequest[] = [];

  constructor(private readonly respond: (request: SystemOneRequest) => SystemOneResponse | Promise<SystemOneResponse>) {}

  async systemOne(request: SystemOneRequest): Promise<SystemOneResponse> {
    this.calls.push(request);
    return this.respond(request);
  }
}

describe("decision model curation", () => {
  it("re-ranks story groups using typed decision answers", async () => {
    const items = [
      item("benchmark", "New inference benchmark with reproducible methodology"),
      item("promo", "Vendor announces annual product event"),
    ];
    const groups = [
      group("promo", "Vendor announces annual product event", 0.9),
      group("benchmark", "New inference benchmark with reproducible methodology", 0.4),
    ];

    const client = new FakeClient((request) => {
      const headline = String((request.state as any).story.headline);
      const strong = headline.includes("benchmark");
      return {
        model: "fixture",
        answers: {
          interest: scoreAnswer(strong ? 3 : 1),
          substance: scoreAnswer(strong ? 3 : 0),
          consequence: scoreAnswer(strong ? 2 : 1),
          promotional: { type: "noul", noul: strong ? 0.05 : 0.9 },
        },
      };
    });

    const ranked = await rankWithDecisionModel(config(), groups, items, client);

    expect(ranked.map((story) => story.itemIds[0])).toEqual(["benchmark", "promo"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("merges cross-source groups when the model says they are the same event", async () => {
    const items = [
      item("a", "OpenAI launches GPT-6 reasoning model", "feed-a"),
      item("b", "GPT-6 reasoning model launch reaches developers", "feed-b"),
    ];
    const groups = [
      group("a", "OpenAI launches GPT-6 reasoning model", 0.9),
      group("b", "GPT-6 reasoning model launch reaches developers", 0.8),
    ];
    const client = new FakeClient(() => ({
      model: "fixture",
      answers: { sameStory: { type: "noul", noul: 0.96 } },
    }));

    const deduped = await dedupeWithDecisionModel(config(), groups, items, client);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.itemIds).toEqual(["a", "b"]);
    expect(client.calls).toHaveLength(1);
  });

  it("keeps plausible matches separate below the configured duplicate threshold", async () => {
    const items = [
      item("a", "OpenAI launches GPT-6 reasoning model", "feed-a"),
      item("b", "GPT-6 reasoning model benchmark published", "feed-b"),
    ];
    const groups = [
      group("a", "OpenAI launches GPT-6 reasoning model", 0.9),
      group("b", "GPT-6 reasoning model benchmark published", 0.8),
    ];
    const client = new FakeClient(() => ({
      model: "fixture",
      answers: { sameStory: { type: "noul", noul: 0.6 } },
    }));

    const deduped = await dedupeWithDecisionModel(config({ DECISION_MODEL_DUPLICATE_THRESHOLD: "0.85" }), groups, items, client);

    expect(deduped).toHaveLength(2);
  });

  it("does nothing when the decision layer is disabled", async () => {
    const disabled = loadConfig(baseEnv);
    const groups = [group("a", "Story A")];
    const client = new FakeClient(() => { throw new Error("should not run"); });

    const result = await applyDecisionModel(disabled, groups, [item("a", "Story A")], client);

    expect(result).toEqual(groups);
    expect(client.calls).toHaveLength(0);
  });
});
