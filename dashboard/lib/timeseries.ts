import { query } from "./postgres";
import { computeExperimentResults } from "@/lib/experiment-results";
import type { Experiment } from "@/lib/types";

export interface KpiDailyPoint {
  day: string;
  value: number;
}

export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
  srm_alerts: KpiDailyPoint[];
  readouts_generated: KpiDailyPoint[];
}

export async function getKpiTimeseries(customerId: string): Promise<KpiSparklineSeries> {
  // Cumulative experiment count per day (experiments created on or before that day)
  const activeRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(e.id)::int as count
     FROM days d
     LEFT JOIN experiments e
       ON e.customer_id = $1
       AND e.created_at::date <= d.day
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [customerId]
  );

  // Cumulative event count per day
  const eventsRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(e.*)::int as count
     FROM days d
     LEFT JOIN raw_events e ON e.ts::date <= d.day
     GROUP BY d.day
     ORDER BY d.day ASC`
  );

  // Cumulative distinct users assigned per day
  const usersRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(DISTINCT a.user_id)::int as count
     FROM days d
     LEFT JOIN raw_assignments a ON a.assigned_at::date <= d.day
     GROUP BY d.day
     ORDER BY d.day ASC`
  );

  // Cumulative readouts generated per day
  const readoutsRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(r.id)::int as count
     FROM days d
     LEFT JOIN readouts r
       ON r.generated_at::date <= d.day
       AND r.experiment_id IN (
         SELECT id FROM experiments WHERE customer_id = $1
       )
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [customerId]
  );

  // CUPED + SRM: no historical snapshots — compute current values once, flatline across 7 days
  const days = activeRows.map((r) => r.day);
  const experiments = await query<Experiment>(
    `SELECT * FROM experiments WHERE customer_id = $1 AND status = 'running'`,
    [customerId]
  );

  let cupedSum = 0;
  let cupedCount = 0;
  let currentSrmAlerts = 0;
  for (const exp of experiments) {
    try {
      const results = await computeExperimentResults(exp);
      if (!results) continue;
      const controlVR = results.variants?.find((v) => v.name === "control")?.variance_reduction_pct;
      const treatmentVR = results.variants?.find((v) => v.name === "treatment")?.variance_reduction_pct;
      let expVR: number | null = null;
      if (controlVR != null && treatmentVR != null) expVR = (controlVR + treatmentVR) / 2;
      else if (controlVR != null) expVR = controlVR;
      else if (treatmentVR != null) expVR = treatmentVR;
      if (expVR != null) { cupedSum += expVR; cupedCount += 1; }
      if (results.srm_flag) currentSrmAlerts += 1;
    } catch (err) {
      console.warn(`Failed results lookup for ${exp.id}:`, err);
    }
  }

  const currentCuped = cupedCount > 0 ? cupedSum / cupedCount : 0;
  const cupedSeries: KpiDailyPoint[] = days.map((day) => ({ day, value: currentCuped }));
  const srmSeries: KpiDailyPoint[] = days.map((day) => ({ day, value: currentSrmAlerts }));

  return {
    active_experiments: activeRows.map((r) => ({ day: r.day, value: r.count })),
    total_events: eventsRows.map((r) => ({ day: r.day, value: r.count })),
    total_users: usersRows.map((r) => ({ day: r.day, value: r.count })),
    avg_cuped_variance_reduction: cupedSeries,
    srm_alerts: srmSeries,
    readouts_generated: readoutsRows.map((r) => ({ day: r.day, value: r.count })),
  };
}

export interface DailyMetricVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface DailyExperimentLift {
  day: string;
  control_n: number;
  control_conversions: number;
  control_rate: number;
  treatment_n: number;
  treatment_conversions: number;
  treatment_rate: number;
  lift_pct: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

export async function getDailyMetricVolume(): Promise<DailyMetricVolume[]> {
  const rows = await query<{ day: string; event_name: string; count: number }>(
    `WITH primary_metrics AS (
       SELECT DISTINCT primary_metric FROM experiments
     )
     SELECT
       TO_CHAR(DATE(ts), 'YYYY-MM-DD') as day,
       event_name,
       COUNT(*)::int as count
     FROM raw_events
     WHERE event_name IN (SELECT primary_metric FROM primary_metrics)
       AND ts > NOW() - INTERVAL '7 days'
     GROUP BY DATE(ts), event_name
     ORDER BY day ASC`
  );
  return rows;
}

export async function getExperimentDailyLift(
  experimentSlug: string,
  primaryMetric: string
): Promise<DailyExperimentLift[]> {
  const rows = await query<{
    day: string;
    control_n: number;
    control_conversions: number;
    treatment_n: number;
    treatment_conversions: number;
  }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '7 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     ),
     cumulative_assignments AS (
       SELECT
         d.day,
         a.variant,
         COUNT(DISTINCT a.user_id) as n
       FROM days d
       LEFT JOIN raw_assignments a
         ON a.experiment_id = $1
         AND a.assigned_at::date <= d.day
       GROUP BY d.day, a.variant
     ),
     cumulative_conversions AS (
       SELECT
         d.day,
         a.variant,
         COUNT(DISTINCT e.user_id) as conversions
       FROM days d
       LEFT JOIN raw_assignments a ON a.experiment_id = $1
       LEFT JOIN raw_events e
         ON e.experiment_id = $1
         AND e.user_id = a.user_id
         AND e.event_name = $2
         AND e.ts::date <= d.day
       WHERE a.assigned_at::date <= d.day
       GROUP BY d.day, a.variant
     )
     SELECT
       TO_CHAR(ca.day, 'YYYY-MM-DD') as day,
       MAX(CASE WHEN ca.variant = 'control'   THEN ca.n ELSE 0 END)::int as control_n,
       MAX(CASE WHEN cc.variant = 'control'   THEN cc.conversions ELSE 0 END)::int as control_conversions,
       MAX(CASE WHEN ca.variant = 'treatment' THEN ca.n ELSE 0 END)::int as treatment_n,
       MAX(CASE WHEN cc.variant = 'treatment' THEN cc.conversions ELSE 0 END)::int as treatment_conversions
     FROM cumulative_assignments ca
     LEFT JOIN cumulative_conversions cc
       ON ca.day = cc.day AND ca.variant = cc.variant
     GROUP BY ca.day
     ORDER BY ca.day ASC`,
    [experimentSlug, primaryMetric]
  );

  return rows.map((r) => {
    const control_rate = r.control_n > 0 ? r.control_conversions / r.control_n : 0;
    const treatment_rate = r.treatment_n > 0 ? r.treatment_conversions / r.treatment_n : 0;
    const lift_pct = control_rate > 0 ? ((treatment_rate - control_rate) / control_rate) * 100 : 0;
    return {
      day: r.day,
      control_n: r.control_n,
      control_conversions: r.control_conversions,
      control_rate,
      treatment_n: r.treatment_n,
      treatment_conversions: r.treatment_conversions,
      treatment_rate,
      lift_pct,
    };
  });
}

export async function getExperimentFunnel(
  experimentSlug: string,
  primaryMetric: string
): Promise<FunnelStep[]> {
  const assignedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count
     FROM raw_assignments
     WHERE experiment_id = $1`,
    [experimentSlug]
  );
  const assigned = assignedRow[0]?.count || 0;

  const exposedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1`,
    [experimentSlug]
  );
  const exposed = exposedRow[0]?.count || 0;

  const intermediateRow = await query<{ event_name: string; count: number }>(
    `SELECT event_name, COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1 AND event_name != $2
     GROUP BY event_name
     ORDER BY count DESC
     LIMIT 1`,
    [experimentSlug, primaryMetric]
  );
  const intermediate = intermediateRow[0]?.count || 0;
  const intermediateName = intermediateRow[0]?.event_name || "engagement";

  const convertedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1 AND event_name = $2`,
    [experimentSlug, primaryMetric]
  );
  const converted = convertedRow[0]?.count || 0;

  return [
    { step: "Assigned", count: assigned, drop_off_pct: null },
    {
      step: "Exposed",
      count: exposed,
      drop_off_pct: assigned > 0 ? ((assigned - exposed) / assigned) * 100 : null,
    },
    {
      step: intermediateName,
      count: intermediate,
      drop_off_pct: exposed > 0 ? ((exposed - intermediate) / exposed) * 100 : null,
    },
    {
      step: primaryMetric,
      count: converted,
      drop_off_pct: intermediate > 0 ? ((intermediate - converted) / intermediate) * 100 : null,
    },
  ];
}
