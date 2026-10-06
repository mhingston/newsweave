import "dotenv/config";
import { z } from "zod";

const booleanFlag = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const schema = z.object({
  DATABASE_URL: z.string().startsWith("postgres"),
  MINIFLUX_URL: z.string().url(),
  MINIFLUX_API_TOKEN: z.string().min(1),
  AI_BASE_URL: z.string().url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  EMAIL_TO: z.string().min(1),
  TIMEZONE: z.string().default("Europe/London"),
  PUBLICATION_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("06:00"),
  RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  FABRIC_BIN: z.string().min(1).default("fabric"),
  YTDLP_BIN: z.string().min(1).default("yt-dlp"),
  RETRY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  FANOUT_FEED_IDS: z.string().optional(),
  FANOUT_FEED_TITLES: z.string().optional(),
  FANOUT_CANDIDATE_FEED_IDS: z.string().optional(),
  FANOUT_CANDIDATE_FEED_TITLES: z.string().optional(),
  FANOUT_MIN_LINKS: z.coerce.number().int().positive().default(5),
  FANOUT_MIN_DOMAINS: z.coerce.number().int().positive().default(3),
  DECISION_MODEL_ENABLED: booleanFlag.default(false),
  DECISION_MODEL_DEDUPE_ENABLED: booleanFlag.default(true),
  DECISION_MODEL_DUPLICATE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  DECISION_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),\n  DECISION_MODEL_RUN_BUDGET_MS: z.coerce.number().int().positive().default(60_000),
  DECISION_EDITORIAL_POLICY: z.string().min(1).default(
    "Prioritize substantive, novel, consequential information with concrete mechanisms, evidence, implementation detail, or decisions the reader can act on. Deprioritize promotional, repetitive, thin, or purely speculative coverage.",
  ),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}

export function parseEmailRecipients(value: string): string[] {
  return value.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
}

export function parseStringSet(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/[,;\n]+/).map((item) => item.trim().toLowerCase()).filter(Boolean));
}
