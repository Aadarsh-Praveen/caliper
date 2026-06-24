import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query } from "@/lib/postgres";
import { getDailyMetricVolume, getExperimentDailyLift, getKpiTimeseries } from "@/lib/timeseries";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const [dailyVolume, kpiSeries] = await Promise.all([
    getDailyMetricVolume(),
    getKpiTimeseries(customer.id),
  ]);

  const experiments = await query<{ id: string; slug: string; primary_metric: string }>(
    `SELECT id, slug, primary_metric FROM experiments
     WHERE customer_id = $1 AND status = 'running'`,
    [customer.id]
  );

  const sparklines: Record<string, Array<{ day: string; lift_pct: number }>> = {};
  for (const exp of experiments) {
    const series = await getExperimentDailyLift(exp.slug, exp.primary_metric);
    sparklines[exp.id] = series.map((s) => ({ day: s.day, lift_pct: s.lift_pct }));
  }

  return corsResponse({ daily_volume: dailyVolume, sparklines, kpi_sparklines: kpiSeries });
}
