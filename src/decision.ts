import {
  createJevClient,
  noul,
  score,
  type JevAnswer,
  type SystemOneLikeClient,
} from "@mhingston5/jev-cli";
import type { Config } from "./config.js";
import type { CuratableItem, StoryGroup } from "./curate.js";

const SCORE_LEVELS = [
  "low",
  "moderate",
  "high",
  "essential",
] as const;

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "been", "being", "from", "have",
  "into", "more", "most", "new", "news", "over", "that", "their", "this", "with",
]);

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedScore(answer: JevAnswer | undefined): number | undefined {
  if (!answer || answer.type !== "score") return undefined;
  return clamp(answer.score / (SCORE_LEVELS.length - 1));
}

function noulProbability(answer: JevAnswer | undefined): number | undefined {
  return answer?.type === "noul" ? clamp(answer.noul) : undefined;
}

function itemMap(items: CuratableItem[]): Map<string, CuratableItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function storyState(group: StoryGroup, items: Map<string, CuratableItem>): Record<string, unknown> {
  const members = group.itemIds
    .map((id) => items.get(id))
    .filter((item): item is CuratableItem => Boolean(item))
    .map((item) => ({
      title: item.title,
      url: item.url,
      feed: item.feedTitle ?? item.feedId,
      kind: item.kind,
    }));

  return {
    headline: group.headline,
    summary: group.summary,
    keyPoints: group.keyPoints,
    sources: members,
  };
}

function storyTokens(group: StoryGroup, items: Map<string, CuratableItem>): Set<string> {
  const memberTitles = group.itemIds
    .map((id) => items.get(id)?.title ?? "")
    .join(" ");
  const text = `${group.headline} ${memberTitles}`.toLowerCase();
  return new Set(
    (text.match(/[a-z0-9][a-z0-9.+#-]*/g) ?? [])
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function plausibleDuplicate(
  left: StoryGroup,
  right: StoryGroup,
  items: Map<string, CuratableItem>,
): boolean {
  const leftTokens = storyTokens(left, items);
  const rightTokens = storyTokens(right, items);
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = smaller === leftTokens ? rightTokens : leftTokens;
  let overlap = 0;
  for (const token of smaller) if (larger.has(token)) overlap++;
  if (overlap >= 3) return true;
  const denominator = Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  return overlap >= 2 && overlap / denominator >= 0.2;
}

function mergeGroups(primary: StoryGroup, duplicate: StoryGroup): StoryGroup {
  return {
    ...primary,
    itemIds: [...new Set([...primary.itemIds, ...duplicate.itemIds])],
    score: Math.max(primary.score, duplicate.score),
  };
}

export function createDecisionClient(config: Config): SystemOneLikeClient {
  return createJevClient({ timeoutMs: config.DECISION_MODEL_TIMEOUT_MS });
}

export async function rankWithDecisionModel(
  config: Config,
  groups: StoryGroup[],
  items: CuratableItem[],
  client: SystemOneLikeClient,
): Promise<StoryGroup[]> {
  const itemsById = itemMap(items);
  const ranked: StoryGroup[] = [];

  for (const group of groups) {
    try {
      const response = await client.systemOne({
        state: {
          editorialPolicy: config.DECISION_EDITORIAL_POLICY,
          story: storyState(group, itemsById),
        },
        questions: {
          interest: score(
            "How strongly does this story match the editorial policy in state?",
            [...SCORE_LEVELS],
          ),
          substance: score(
            "How much concrete new information, evidence, mechanism, implementation detail, or useful specificity does this story contain?",
            [...SCORE_LEVELS],
          ),
          consequence: score(
            "How likely is this story to affect a meaningful technical, product, operational, or strategic decision?",
            [...SCORE_LEVELS],
          ),
          promotional: noul(
            "Is this story primarily promotional, sponsored, marketing-led, or a thin announcement with little substantive information?",
          ),
        },
      });

      const interest = normalizedScore(response.answers.interest);
      const substance = normalizedScore(response.answers.substance);
      const consequence = normalizedScore(response.answers.consequence);
      const promotional = noulProbability(response.answers.promotional);

      if (
        interest === undefined
        || substance === undefined
        || consequence === undefined
        || promotional === undefined
      ) {
        ranked.push(group);
        continue;
      }

      const editorialScore = interest * 0.55 + substance * 0.30 + consequence * 0.15;
      const promotionPenalty = 1 - 0.5 * promotional;
      ranked.push({ ...group, score: clamp(editorialScore * promotionPenalty) });
    } catch (error) {
      console.warn(`Decision ranking failed for "${group.headline}": ${errorMessage(error)}`);
      ranked.push(group);
    }
  }

  return ranked.sort((left, right) => right.score - left.score || left.headline.localeCompare(right.headline));
}

export async function dedupeWithDecisionModel(
  config: Config,
  groups: StoryGroup[],
  items: CuratableItem[],
  client: SystemOneLikeClient,
): Promise<StoryGroup[]> {
  if (!config.DECISION_MODEL_DEDUPE_ENABLED || groups.length < 2) return groups;

  const itemsById = itemMap(items);
  const accepted: StoryGroup[] = [];

  for (const candidate of groups) {
    let duplicateIndex = -1;

    for (let index = 0; index < accepted.length; index++) {
      const existing = accepted[index]!;
      if (!plausibleDuplicate(existing, candidate, itemsById)) continue;

      try {
        const response = await client.systemOne({
          state: {
            first: storyState(existing, itemsById),
            second: storyState(candidate, itemsById),
          },
          questions: {
            sameStory: noul(
              "Do these two story groups cover the same specific underlying event, announcement, release, incident, or development? Related topics are not enough.",
            ),
          },
        });
        const probability = noulProbability(response.answers.sameStory);
        if (probability !== undefined && probability >= config.DECISION_MODEL_DUPLICATE_THRESHOLD) {
          duplicateIndex = index;
          break;
        }
      } catch (error) {
        console.warn(
          `Decision duplicate check failed for "${existing.headline}" vs "${candidate.headline}": ${errorMessage(error)}`,
        );
      }
    }

    if (duplicateIndex >= 0) {
      accepted[duplicateIndex] = mergeGroups(accepted[duplicateIndex]!, candidate);
    } else {
      accepted.push(candidate);
    }
  }

  return accepted;
}

export async function applyDecisionModel(
  config: Config,
  groups: StoryGroup[],
  items: CuratableItem[],
  client?: SystemOneLikeClient,
): Promise<StoryGroup[]> {
  if (!config.DECISION_MODEL_ENABLED || groups.length === 0) return groups;

  let decisionClient: SystemOneLikeClient;
  try {
    decisionClient = client ?? createDecisionClient(config);
  } catch (error) {
    console.warn(`Decision model disabled for this run: ${errorMessage(error)}`);
    return groups;
  }

  const ranked = await rankWithDecisionModel(config, groups, items, decisionClient);
  return dedupeWithDecisionModel(config, ranked, items, decisionClient);
}
