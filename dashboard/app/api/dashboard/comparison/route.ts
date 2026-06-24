import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query } from "@/lib/postgres";
import { getExperimentDailyLift, getExperimentFunnel } from "@/lib/timeseries";
import { computeExperimentResults } from "@/lib/experiment-results";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import type { Experiment } from "@/lib/types";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const experiments = await query<Experiment>(
    `SELECT * FROM experiments
     WHERE customer_id = $1 AND status = 'running'
     ORDER BY created_at ASC`,
    [customer.id]
  );

  const items = await Promise.all(
    experiments.map(async (exp) => {
      try {
        const [results, dailyLift, funnel] = await Promise.all([
          computeExperimentResults(exp),
          getExperimentDailyLift(exp.slug, exp.primary_metric),
          getExperimentFunnel(exp.slug, exp.primary_metric),
        ]);

        const controlVR = results?.variants?.find((v) => v.name === "control")?.variance_reduction_pct;
        const treatmentVR = results?.variants?.find((v) => v.name === "treatment")?.variance_reduction_pct;
        let cupedVR: number | null = null;
        if (controlVR != null && treatmentVR != null) cupedVR = (controlVR + treatmentVR) / 2;
        else if (controlVR != null) cupedVR = controlVR;
        else if (treatmentVR != null) cupedVR = treatmentVR;

        return {
          id: exp.id,
          slug: exp.slug,
          name: exp.name,
          status: exp.status,
          lift: results?.lift ?? null,
          p_value: results?.p_value ?? null,
          msprt_p_value: results?.msprt_p_value ?? null,
          cuped_variance_reduction: cupedVR,
          srm_flag: results?.srm_flag ?? null,
          n_total: results?.variants?.reduce((s, v) => s + (v.n || 0), 0) ?? 0,
          daily_lift: dailyLift,
          funnel,
        };
      } catch (err) {
        console.warn(`Failed to load comparison data for ${exp.id}:`, err);
        return {
          id: exp.id,
          slug: exp.slug,
          name: exp.name,
          status: exp.status,
          lift: null,
          p_value: null,
          msprt_p_value: null,
          cuped_variance_reduction: null,
          srm_flag: null,
          n_total: 0,
          daily_lift: [],
          funnel: [],
        };
      }
    })
  );

  return corsResponse({ experiments: items });
}
