import { Resend } from "resend";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { parseEmailRecipients } from "./config.js";
import { curate, type CuratableItem } from "./curate.js";
import { renderDigest, type RenderableStory } from "./email.js";

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function publish(pool: Pool, config: Config, date = localDate(config.TIMEZONE)): Promise<{ status: string; itemCount: number; digestDate: string }> {
  const existing = await pool.query("SELECT status, item_count FROM digests WHERE digest_date=$1", [date]);
  if (existing.rows[0]) return { status: String(existing.rows[0].status), itemCount: Number(existing.rows[0].item_count), digestDate: date };
  const result = await pool.query(`SELECT i.id, i.title, i.url, i.kind, i.summary FROM items i WHERE i.status='summarized' AND NOT EXISTS (SELECT 1 FROM digest_items di WHERE di.item_id=i.id) ORDER BY i.created_at ASC`);
  const items = result.rows.map((row) => ({ ...row, summary: row.summary as CuratableItem["summary"] })) as CuratableItem[];
  if (items.length === 0) {
    await pool.query("INSERT INTO digests (digest_date,status,item_count) VALUES ($1,'no_digest',0)", [date]);
    return { status: "no_digest", itemCount: 0, digestDate: date };
  }
  const groups = await curate(config, items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const stories: RenderableStory[] = groups.map((group) => ({ ...group, items: group.itemIds.map((id) => itemById.get(id)!).filter(Boolean), kind: group.itemIds.some((id) => itemById.get(id)?.kind === "fanout") ? "fanout" : "rss" }));
  const html = renderDigest(date, stories);
  const subject = `Newsweave Daily — ${date}`;
  const email = await new Resend(config.RESEND_API_KEY).emails.send({ from: config.EMAIL_FROM, to: parseEmailRecipients(config.EMAIL_TO), subject, html });
  if (email.error) throw new Error(email.error.message);
  const digest = await pool.query<{ id: string }>("INSERT INTO digests (digest_date,status,subject,html,item_count,sent_at) VALUES ($1,'sent',$2,$3,$4,now()) RETURNING id", [date, subject, html, items.length]);
  for (const item of items) await pool.query("INSERT INTO digest_items (digest_id,item_id) VALUES ($1,$2)", [digest.rows[0]!.id, item.id]);
  return { status: "sent", itemCount: items.length, digestDate: date };
}
