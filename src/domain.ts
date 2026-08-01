export type SourceKind = "rss" | "fanout";

export interface FeedMetadata {
  feedId: string;
  feedTitle: string;
  categoryTitle?: string;
  fanout: boolean;
}

export interface SourceReference {
  minifluxEntryId: string;
  feed: FeedMetadata;
  title: string;
  url: string;
  publishedAt?: string;
}

export interface CandidateItem {
  canonicalUrl: string;
  title: string;
  url: string;
  kind: SourceKind;
  source: SourceReference;
  parentEntryId?: string;
  publisherHost?: string;
  content?: string;
}
