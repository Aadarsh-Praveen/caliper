import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { generateReadout, type BedrockReadoutInput } from "@/lib/bedrock";
import { computeExperimentResults } from "@/lib/experiment-results";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import type { Experiment, Readout } from "@/lib/types";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const experiment = await queryOne<Experiment>(
    `SELECT * FROM experiments WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );
  if (!experiment) return corsResponse({ error: "Experiment not found" }, 404);

  const results = await computeExperimentResults(experiment);

  const startedAt = experiment.started_at ? new Date(experiment.started_at) : new Date();
  const daysRunning = Math.max(
    1,
    Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Derive cuped variance reduction from control variant stats
  const ctrlVariant = results.variants.find((v) => v.name === "control");
  const cupedVarianceReduction =
    ctrlVariant?.variance_reduction_pct != null
      ? ctrlVariant.variance_reduction_pct / 100
      : null;

  const input: BedrockReadoutInput = {
    experimentName: experiment.name,
    hypothesis: experiment.hypothesis ?? "",
    primaryMetric: experiment.primary_metric,
    metricType: experiment.metric_type,
    status: experiment.status,
    variants: results.variants.map((v) => ({
      name: v.name,
      n: v.n,
      conversions: v.conversions,
      conversion_rate: v.conversion_rate,
    })),
    lift: results.lift ?? null,
    liftCi: results.lift_ci ?? null,
    pValue: results.p_value ?? null,
    msprtPValue: results.msprt_p_value ?? null,
    msprtShouldStop: results.msprt_should_stop ?? null,
    cupedVarianceReduction,
    srmDetected: !!results.srm_flag,
    srmObserved: results.srm_flag?.observed,
    srmExpected: results.srm_flag?.expected,
    daysRunning,
  };

  let readout;
  try {
    readout = await generateReadout(input);
  } catch (error) {
    console.error("[Bedrock] Failed to generate readout:", error);
    return corsResponse({ error: "Failed to generate readout. Please try again." }, 500);
  }

  const inserted = await queryOne<Readout>(
    `INSERT INTO readouts (
      experiment_id, verdict, summary, recommendation, confidence,
      generated_at, model_id
    ) VALUES ($1, $2, $3, $4, $5, now(), $6)
    RETURNING *`,
    [
      id,
      readout.verdict,
      readout.summary,
      readout.recommendation,
      readout.confidence,
      process.env.BEDROCK_MODEL_ID ?? "unknown",
    ]
  );

  return corsResponse({ readout: inserted, raw_response: readout.raw_response }, 200);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const readout = await queryOne<Readout>(
    `SELECT * FROM readouts WHERE experiment_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [id]
  );

  return corsResponse({ readout: readout ?? null }, 200);
}
