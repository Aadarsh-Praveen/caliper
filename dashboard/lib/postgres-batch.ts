import { query } from "./postgres";

export interface RawEventInsert {
  experiment_id: string;  // slug, e.g. "hero_cta_test"
  user_id: string;
  variant: string;
  event_name: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  ts: string | Date;
}

export interface RawAssignmentInsert {
  experiment_id: string;  // slug
  user_id: string;
  variant: string;
  pre_experiment_activity?: number | null;
  assigned_at: string | Date;
}

/**
 * Bulk insert events into raw_events.
 * event_id is auto-generated (uuid_generate_v4()), so each insert is naturally unique.
 */
export async function insertRawEvents(events: RawEventInsert[]): Promise<void> {
  if (events.length === 0) return;

  const cols = ["experiment_id", "user_id", "variant", "event_name", "properties", "context", "ts"] as const;
  const placeholders: string[] = [];
  const values: unknown[] = [];

  events.forEach((e, i) => {
    const base = i * cols.length;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
    values.push(
      e.experiment_id,
      e.user_id,
      e.variant,
      e.event_name,
      JSON.stringify(e.properties ?? {}),
      JSON.stringify(e.context ?? {}),
      e.ts instanceof Date ? e.ts.toISOString() : e.ts,
    );
  });

  await query(
    `INSERT INTO raw_events (experiment_id, user_id, variant, event_name, properties, context, ts)
     VALUES ${placeholders.join(", ")}`,
    values,
  );
}

/**
 * Insert one assignment. ON CONFLICT DO NOTHING makes this idempotent —
 * raw_assignments has UNIQUE (experiment_id, user_id).
 */
export async function insertRawAssignment(a: RawAssignmentInsert): Promise<void> {
  await query(
    `INSERT INTO raw_assignments (experiment_id, user_id, variant, pre_experiment_activity, assigned_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (experiment_id, user_id) DO NOTHING`,
    [
      a.experiment_id,
      a.user_id,
      a.variant,
      a.pre_experiment_activity ?? null,
      a.assigned_at instanceof Date ? a.assigned_at.toISOString() : a.assigned_at,
    ],
  );
}
