import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { getSummary, ddb, tableName } from "@/lib/dynamodb";
import { twoProportionZTest } from "@/lib/stats";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
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

  // Read pre-computed SRM flag (written by aggregator Lambda)
  let srm_flag = null;
  try {
    const srmResp = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `EXP#${experiment.slug}`, SK: "SRM#detected" },
      })
    );
    if (srmResp.Item) {
      srm_flag = {
        observed: Object.fromEntries(
          Object.entries(srmResp.Item.observed as Record<string, number>).map(([k, v]) => [k, Number(v)])
        ),
        expected: Object.fromEntries(
          Object.entries(srmResp.Item.expected as Record<string, number>).map(([k, v]) => [k, Number(v)])
        ),
        chi2_stat: Number(srmResp.Item.chi2_stat),
        p_value: Number(srmResp.Item.p_value),
      };
    }
  } catch {
    // SRM flag is optional; don't fail the request
  }

  // Read CUPED per-variant stats (written by aggregator Lambda)
  let cuped_lift_ci: [number, number] | null = null;
  try {
    const [ctrlCuped, trtCuped, cupedLatest] = await Promise.all([
      ddb.send(new GetCommand({ TableName: tableName, Key: { PK: `EXP#${experiment.slug}`, SK: "STATS#cuped#control" } })),
      ddb.send(new GetCommand({ TableName: tableName, Key: { PK: `EXP#${experiment.slug}`, SK: "STATS#cuped#treatment" } })),
      ddb.send(new GetCommand({ TableName: tableName, Key: { PK: `EXP#${experiment.slug}`, SK: "STATS#cuped#latest" } })),
    ]);

    const ctrlItem = ctrlCuped.Item;
    const trtItem = trtCuped.Item;

    if (ctrlItem && trtItem) {
      const ctrlVariance = Number(ctrlItem.variance);
      const trtVariance = Number(trtItem.variance);

      // Attach per-variant CUPED stats to the variant response
      const ctrlStat = variantStats.find((v) => v.name === "control");
      const trtStat = variantStats.find((v) => v.name !== "control");

      if (ctrlStat) {
        ctrlStat.cuped_adjusted_mean = Number(ctrlItem.mean);
        ctrlStat.cuped_adjusted_variance = ctrlVariance;
        ctrlStat.variance_reduction_pct =
          ctrlStat.variance > 0
            ? Math.max(0, (1 - ctrlVariance / ctrlStat.variance) * 100)
            : 0;
      }
      if (trtStat) {
        trtStat.cuped_adjusted_mean = Number(trtItem.mean);
        trtStat.cuped_adjusted_variance = trtVariance;
        trtStat.variance_reduction_pct =
          trtStat.variance > 0
            ? Math.max(0, (1 - trtVariance / trtStat.variance) * 100)
            : 0;
      }
    }

    if (cupedLatest.Item) {
      cuped_lift_ci = [Number(cupedLatest.Item.ci_low), Number(cupedLatest.Item.ci_high)];
    }
  } catch {
    // CUPED stats are optional; don't fail the request
  }

  // Read mSPRT always-valid p-value from STATS#latest (written by aggregator Lambda)
  let msprt_p_value: number | null = null;
  let msprt_should_stop = false;
  try {
    const statsResp = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `EXP#${experiment.slug}`, SK: "STATS#latest" },
      })
    );
    if (statsResp.Item?.msprt_p_value != null) {
      msprt_p_value = Number(statsResp.Item.msprt_p_value);
      msprt_should_stop = Boolean(statsResp.Item.msprt_should_stop);
    }
  } catch {
    // mSPRT stats are optional; don't fail the request
  }

  const results: ExperimentResults = {
    experiment,
    variants: variantStats,
    lift: statsResult?.lift ?? null,
    lift_ci: statsResult?.lift_ci ?? null,
    cuped_lift_ci,
    p_value: statsResult?.p_value ?? null,
    msprt_p_value,
    msprt_should_stop,
    is_significant: statsResult?.is_significant ?? false,
    srm_flag,
    segments: [],
    readout: null,
  };

  return corsResponse(results);
}
