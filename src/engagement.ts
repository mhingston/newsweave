import type { Pool } from "pg";
import type { Config } from "./config.js";

interface MetricsRow {
  email_id?: unknown;
  opened?: unknown;
  unique_opened?: unknown;
  clicked?: unknown;
  unique_clicked?: unknown;
}

interface MetricsResponse { data?: MetricsRow[]; }

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function syncEngagement(pool: Pool, config: Config): Promise<{ checked: number; updated: number }> {
  const digests = await pool.query<{ id: string; resend_email_id: string; sent_at: Date }>(
    `SELECT id, resend_email_id, sent_at FROM digests
     WHERE status='sent' AND resend_email_id IS NOT NULL AND sent_at > now() - interval '30 days'`,
  );
  if (digests.rows.length === 0) return { checked: 0, updated: 0 };
  const start = new Date(Math.min(...digests.rows.map((row) => new Date(row.sent_at).getTime()))).toISOString();
  const params = new URLSearchParams({
    start_date: start,
    end_date: new Date().toISOString(),
    metrics: "opened,unique_opened,clicked,unique_clicked",
    dimensions: "email",
    granularity: "daily",
  });
  const response = await fetch(`https://api.resend.com/emails/metrics?${params}`, {
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Resend metrics ${response.status}: ${await response.text()}`);
  const payload = await response.json() as MetricsResponse;
  const byEmail = new Map<string, { opened: number; uniqueOpened: number; clicked: number; uniqueClicked: number }>();
  for (const row of payload.data ?? []) {
    if (typeof row.email_id !== "string") continue;
    const current = byEmail.get(row.email_id) ?? { opened: 0, uniqueOpened: 0, clicked: 0, uniqueClicked: 0 };
    current.opened += count(row.opened);
    current.uniqueOpened += count(row.unique_opened);
    current.clicked += count(row.clicked);
    current.uniqueClicked += count(row.unique_clicked);
    byEmail.set(row.email_id, current);
  }
  for (const digest of digests.rows) {
    const metrics = byEmail.get(digest.resend_email_id) ?? { opened: 0, uniqueOpened: 0, clicked: 0, uniqueClicked: 0 };
    await pool.query(
      `UPDATE digests SET opened_count=$2, unique_opened_count=$3, clicked_count=$4,
       unique_clicked_count=$5, engagement_checked_at=now() WHERE id=$1`,
      [digest.id, metrics.opened, metrics.uniqueOpened, metrics.clicked, metrics.uniqueClicked],
    );
  }
  return { checked: digests.rows.length, updated: digests.rows.length };
}
