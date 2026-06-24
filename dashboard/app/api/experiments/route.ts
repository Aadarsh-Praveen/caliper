import { z } from "zod";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { query, queryOne } from "@/lib/postgres";
import { getSummary, ddb, tableName } from "@/lib/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { computeExperimentResults } from "@/lib/experiment-results";
import type { Experiment } from "@/lib/types";

const VariantSchema = z.object({
  name: z.string().min(1),
  allocation: z.number().min(0).max(1),
});

const CreateExperimentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9_]+$/, "Slug must be lowercase letters, numbers, and underscores"),
  hypothesis: z.string().optional(),
  primary_metric: z.string().min(1),
  metric_type: z.enum(["binary", "continuous"]),
  variants: z.array(VariantSchema).min(2),
  baseline_conversion_rate: z.number().min(0).max(1).optional(),
  minimum_detectable_effect: z.number().min(0).optional(),
});

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: Request) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing X-API-Key header" }, 401);

  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  let experiments: Experiment[];
  if (status) {
    experiments = await query<Experiment>(
      `SELECT * FROM experiments WHERE customer_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3`,
      [customer.id, status, limit]
    );
  } else {
    experiments = await query<Experiment>(
      `SELECT * FROM experiments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [customer.id, limit]
    );
  }

  // Merge in summary stats + mSPRT from DynamoDB
  const enriched = await Promise.all(
    experiments.map(async (exp) => {
      const [variantStats, statsResp] = await Promise.all([
        Promise.all(
          exp.variants.map(async (v) => {
            const summary = await getSummary(exp.slug, v.name);
            return { name: v.name, n: summary?.n ?? 0, conversions: summary?.conversions ?? 0 };
          })
        ),
        ddb.send(new GetCommand({ TableName: tableName, Key: { PK: `EXP#${exp.slug}`, SK: "STATS#latest" } })).catch(() => null),
      ]);
      const totalN = variantStats.reduce((acc, v) => acc + v.n, 0);
      const statsItem = statsResp?.Item;
      const msprt_p_value = statsItem?.msprt_p_value != null ? Number(statsItem.msprt_p_value) : null;
      const msprt_should_stop = statsItem?.msprt_should_stop === true;
      return { ...exp, sample_size: totalN, msprt_p_value, msprt_should_stop };
    })
  );

  // Count SRM alerts across running experiments (reuses already-loaded full Experiment objects)
  let srmAlerts = 0;
  for (const exp of experiments) {
    if (exp.status !== "running") continue;
    try {
      const results = await computeExperimentResults(exp);
      if (results?.srm_flag) srmAlerts += 1;
    } catch (err) {
      console.warn(`Failed SRM check for ${exp.id}:`, err);
    }
  }

  const readoutsRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM readouts r
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1`,
    [customer.id]
  );
  const readoutsGenerated = parseInt(readoutsRow?.count || "0", 10);

  return corsResponse({
    experiments: enriched,
    srm_alerts: srmAlerts,
    readouts_generated: readoutsGenerated,
  });
}

export async function POST(req: Request) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing X-API-Key header" }, 401);

  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsResponse({ error: "Invalid JSON" }, 400);
  }

  const parsed = CreateExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return corsResponse({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  const totalAllocation = data.variants.reduce((sum, v) => sum + v.allocation, 0);
  if (Math.abs(totalAllocation - 1.0) > 0.001) {
    return corsResponse({ error: "Variant allocations must sum to 1.0" }, 400);
  }

  const experiment = await queryOne<Experiment>(
    `INSERT INTO experiments
      (customer_id, name, slug, hypothesis, primary_metric, metric_type, variants,
       baseline_conversion_rate, minimum_detectable_effect, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
     RETURNING *`,
    [
      customer.id,
      data.name,
      data.slug,
      data.hypothesis ?? null,
      data.primary_metric,
      data.metric_type,
      JSON.stringify(data.variants),
      data.baseline_conversion_rate ?? null,
      data.minimum_detectable_effect ?? null,
    ]
  );

  return corsResponse(experiment, 201);
}
