import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { getSummary } from "@/lib/dynamodb";
import { twoProportionZTest } from "@/lib/stats";
import type { Experiment, ExperimentResults, VariantStats } from "@/lib/types";
import type { NextRequest } from "next/server";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing X-API-Key header" }, 401);

  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const experiment = await queryOne<Experiment>(
    `SELECT * FROM experiments WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );

  if (!experiment) return corsResponse({ error: "Experiment not found" }, 404);

  const variantStats: VariantStats[] = await Promise.all(
    experiment.variants.map(async (v) => {
      const summary = await getSummary(experiment.slug, v.name);
      const n = summary?.n ?? 0;
      const conversions = summary?.conversions ?? 0;
      const sum = summary?.sum ?? 0;
      const sum_sq = summary?.sum_sq ?? 0;
      const mean = n > 0 ? sum / n : 0;
      const variance = n > 1 ? (sum_sq - (sum * sum) / n) / (n - 1) : 0;
      const conversion_rate = n > 0 ? conversions / n : 0;
      return { name: v.name, n, conversions, conversion_rate, mean, variance };
    })
  );

  const control = variantStats.find((v) => v.name === "control") ?? variantStats[0];
  const treatment = variantStats.find((v) => v.name !== "control") ?? variantStats[1];

  let statsResult = null;
  if (control && treatment && experiment.metric_type === "binary") {
    statsResult = twoProportionZTest(
      control.n,
      control.conversions,
      treatment.n,
      treatment.conversions,
      experiment.significance_level ?? 0.05
    );
  }

  const results: ExperimentResults = {
    experiment,
    variants: variantStats,
    lift: statsResult?.lift ?? null,
    lift_ci: statsResult?.lift_ci ?? null,
    p_value: statsResult?.p_value ?? null,
    is_significant: statsResult?.is_significant ?? false,
    srm_flag: null,
    segments: [],
    readout: null,
  };

  return corsResponse(results);
}
