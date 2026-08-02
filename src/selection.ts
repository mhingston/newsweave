import type { CuratableItem, StoryGroup } from "./curate.js";

export interface SelectionLimits {
  maxStories: number;
  maxStoriesPerFeed: number;
}

export const DEFAULT_SELECTION_LIMITS: SelectionLimits = {
  maxStories: 50,
  maxStoriesPerFeed: 5,
};

export function selectStories(
  groups: StoryGroup[],
  items: CuratableItem[],
  limits: SelectionLimits = DEFAULT_SELECTION_LIMITS,
): StoryGroup[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const feedCounts = new Map<string, number>();
  const selected: StoryGroup[] = [];
  const ordered = [...groups].sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline));

  for (const group of ordered) {
    if (selected.length >= limits.maxStories) break;
    const feedIds = new Set(group.itemIds.map((id) => itemById.get(id)?.feedId).filter((id): id is string => Boolean(id)));
    if ([...feedIds].some((feedId) => (feedCounts.get(feedId) ?? 0) >= limits.maxStoriesPerFeed)) continue;
    selected.push(group);
    for (const feedId of feedIds) feedCounts.set(feedId, (feedCounts.get(feedId) ?? 0) + 1);
  }
  return selected;
}
