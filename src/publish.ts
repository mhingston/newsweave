import { Resend } from "resend";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { parseEmailRecipients } from "./config.js";
import { curate, type CuratableItem } from "./curate.js";
import { renderDigest, type RenderableStory } from "./email.js";
import { selectStories } from "./selection.js";
import { isUnusableYouTubeContent } from "./extractor.js";\nimport { applyDecisionModel } from "./decision.js";

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function publish(pool: Pool, config: Config, date = localDate(config.TIMEZONE)): Promise<{ status: string; itemCount: number; digestDate: string }> {
  const existing = await pool.query("SELECT status, item_count FROM digests WHERE digest_date=$1", [date]);
  if (existing.rows[0]) return { status: String(existing.rows[0].status), itemCount: Number(existing.rows[0].item_count), digestDate: date };
  const result = await pool.query(`SELECT i.id, i.title, i.url, i.kind, i.feed_id::text AS "feedId", i.feed_title AS "feedTitle", i.content_text, i.summary FROM items i WHERE i.status='summarized' AND NOT EXISTS (SELECT 1 FROM digest_items di WHERE di.item_id=i.id) AND NOT EXISTS (SELECT 1 FROM item_feedback f WHERE f.item_id=i.id AND f.feedback_kind='downvote') ORDER BY i.created_at ASC`);
  const invalid = result.rows.filter((row) => isUnusableYouTubeContent(String(row.url), String(row.title), `${row.content_text ?? ""}\n${JSON.stringify(row.summary ?? {})}`));
  for (const row of invalid) await pool.query("UPDATE items SET status='failed', last_error=$2, updated_at=now() WHERE id=$1", [row.id, "Excluded: unusable YouTube content"]);
  const items = result.rows.filter((row) => !invalid.includes(row)).map((row) => ({ ...row, summary: row.summary as CuratableItem["summary"] })) as CuratableItem[];
  if (items.length === 0) {
    await pool.query("INSERT INTO digests (digest_date,status,item_count) VALUES ($1,'no_digest',0)", [date]);
    return { status: "no_digest", itemCount: 0, digestDate: date };
  }
  const groups = await curate(config, items);
  const selectedGroups = selectStories(groups, items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const stories: RenderableStory[] = selectedGroups.map((group) => ({ ...group, items: group.itemIds.map((id) => itemById.get(id)!).filter(Boolean), kind: group.itemIds.some((id) => itemById.get(id)?.kind === "fanout") ? "fanout" : "rss" }));
  const html = renderDigest(date, stories);
  const subject = `Newsweave Daily — ${date}`;
  const email = await new Resend(config.RESEND_API_KEY).emails.send({ from: config.EMAIL_FROM, to: parseEmailRecipients(config.EMAIL_TO), subject, html });
  if (email.error) throw new Error(email.error.message);
  const selectedItemIds = new Set(selectedGroups.flatMap((group) => group.itemIds));
  const resendEmailId = typeof email.data?.id === "string" ? email.data.id : null;
  const digest = await pool.query<{ id: string }>("INSERT INTO digests (digest_date,status,subject,html,item_count,sent_at,resend_email_id) VALUES ($1,'sent',$2,$3,$4,now(),$5) RETURNING id", [date, subject, html, selectedGroups.length, resendEmailId]);
  for (const item of items) await pool.query("INSERT INTO digest_items (digest_id,item_id,included) VALUES ($1,$2,$3)", [digest.rows[0]!.id, item.id, selectedItemIds.has(item.id)]);
  return { status: "sent", itemCount: selectedGroups.length, digestDate: date };
}
