import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query, queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { computeExperimentResults } from "@/lib/experiment-results";
import type { Experiment } from "@/lib/types";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const activeRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM experiments WHERE customer_id = $1 AND status = 'running'`,
    [customer.id]
  );
  const activeCount = parseInt(activeRow?.count || "0", 10);

  const eventsRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_events`
  );
  const totalEvents = parseInt(eventsRow?.count || "0", 10);

  const usersRow = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id)::text as count FROM raw_assignments`
  );
  const totalUsers = parseInt(usersRow?.count || "0", 10);

  const experiments = await query<Experiment>(
    `SELECT * FROM experiments WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customer.id]
  );

  const readoutsRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM readouts r
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1`,
    [customer.id]
  );
  const readoutsGenerated = parseInt(readoutsRow?.count || "0", 10);

  let cupedSum = 0;
  let cupedCount = 0;
  let srmAlerts = 0;
  const experimentSummaries: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    lift: number | null;
    p_value: number | null;
    msprt_p_value: number | null;
    srm_flag: unknown;
    n_total: number;
  }> = [];

  for (const exp of experiments) {
    try {
      const results = await computeExperimentResults(exp);
      if (!results) continue;

      const controlVR = results.variants?.find((v) => v.name === "control")?.variance_reduction_pct;
      const treatmentVR = results.variants?.find((v) => v.name === "treatment")?.variance_reduction_pct;
      let expVR: number | null = null;
      if (controlVR != null && treatmentVR != null) {
        expVR = (controlVR + treatmentVR) / 2;
      } else if (controlVR != null) {
        expVR = controlVR;
      } else if (treatmentVR != null) {
        expVR = treatmentVR;
      }

      if (expVR != null && exp.status === "running") {
        cupedSum += expVR;
        cupedCount += 1;
      }

      if (results.srm_flag && exp.status === "running") {
        srmAlerts += 1;
      }

      experimentSummaries.push({
        id: exp.id,
        slug: exp.slug,
        name: exp.name,
        status: exp.status,
        lift: results.lift,
        p_value: results.p_value,
        msprt_p_value: results.msprt_p_value,
        srm_flag: results.srm_flag,
        n_total: results.variants?.reduce((s, v) => s + (v.n || 0), 0) || 0,
      });
    } catch (err) {
      console.warn(`Failed to load results for ${exp.id}:`, err);
    }
  }

  const avgCupedVR = cupedCount > 0 ? cupedSum / cupedCount : null;

  const recentReadouts = await query<{
    id: string;
    experiment_id: string;
    verdict: string;
    summary: string;
    confidence: string;
    generated_at: string;
    experiment_slug: string;
    experiment_name: string;
  }>(
    `SELECT r.id, r.experiment_id, r.verdict, r.summary, r.confidence, r.generated_at,
            e.slug as experiment_slug, e.name as experiment_name
     FROM readouts r
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1
     ORDER BY r.generated_at DESC
     LIMIT 5`,
    [customer.id]
  );

  const dbtRow = await queryOne<{ max_computed_at: string }>(
    `SELECT MAX(computed_at)::text as max_computed_at FROM mart_segment_results`
  );

  const activity: Array<{
    type: string;
    title: string;
    subtitle: string;
    timestamp: string;
    experiment_id?: string;
    experiment_slug?: string;
  }> = [];

  for (const r of recentReadouts) {
    activity.push({
      type: "readout",
      title: `AI Readout: ${verdictLabel(r.verdict)}`,
      subtitle: `${r.experiment_name} — ${r.confidence} confidence`,
      timestamp: r.generated_at,
      experiment_id: r.experiment_id,
      experiment_slug: r.experiment_slug,
    });
  }

  if (dbtRow?.max_computed_at) {
    activity.push({
      type: "dbt_refresh",
      title: "Analytics pipeline refreshed",
      subtitle: "dbt mart_segment_results updated",
      timestamp: dbtRow.max_computed_at,
    });
  }

  activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return corsResponse({
    kpis: {
      active_experiments: activeCount,
      total_events: totalEvents,
      total_users: totalUsers,
      avg_cuped_variance_reduction: avgCupedVR,
      srm_alerts: srmAlerts,
      readouts_generated: readoutsGenerated,
    },
    experiments: experimentSummaries,
    activity: activity.slice(0, 8),
  });
}

function verdictLabel(verdict: string): string {
  const map: Record<string, string> = {
    treatment_wins: "Treatment wins",
    control_wins: "Control wins",
    no_significant_difference: "No significant difference",
    srm_invalidated: "Results invalidated (SRM)",
    insufficient_data: "Insufficient data",
  };
  return map[verdict] || verdict;
}
