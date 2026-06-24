import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { getExperimentDailyLift, getExperimentFunnel } from "@/lib/timeseries";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const experiment = await queryOne<{ slug: string; primary_metric: string }>(
    `SELECT slug, primary_metric FROM experiments
     WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );

  if (!experiment) return corsResponse({ error: "Experiment not found" }, 404);

  const [dailyLift, funnel] = await Promise.all([
    getExperimentDailyLift(experiment.slug, experiment.primary_metric),
    getExperimentFunnel(experiment.slug, experiment.primary_metric),
  ]);

  return corsResponse({ daily_lift: dailyLift, funnel });
}
