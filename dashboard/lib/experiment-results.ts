import { getSummary, ddb, tableName } from "@/lib/dynamodb";
import { twoProportionZTest } from "@/lib/stats";
import { query, queryOne } from "@/lib/postgres";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Experiment, ExperimentResults, VariantStats, Readout, SegmentRow } from "@/lib/types";

/**
 * Compute the full statistical results for a single experiment.
 *
 * Fetches SUMMARY# counters, STATS# (z-test + mSPRT), SRM#detected, and STATS#cuped#*
 * items from DynamoDB in parallel, then reads the latest readout and segment breakdowns
 * from Aurora. Used by the experiment detail page, the comparison API, and the readout
 * generation endpoint. All DynamoDB sub-fetches are wrapped in try/catch so optional
 * stats (SRM, CUPED, mSPRT) degrade gracefully if not yet computed.
 *
 * @param experiment - Experiment row from Aurora (must include slug, variants, metric_type).
 * @returns ExperimentResults with variant stats, lift, CI, p-values, SRM flag, and readout.
 */
export async function computeExperimentResults(
  experiment: Experiment
): Promise<ExperimentResults> {
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
    // SRM flag is optional
  }

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
    // CUPED stats are optional
  }

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
    // mSPRT stats are optional
  }

  const [latestReadout, segments] = await Promise.all([
    queryOne<Readout>(
      `SELECT * FROM readouts WHERE experiment_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [experiment.id]
    ),
    query<SegmentRow>(
      `SELECT segment_dimension, segment_value, variant, n, conversions, conversion_rate
       FROM mart_segment_results
       WHERE experiment_id = $1
       ORDER BY segment_dimension, segment_value, variant`,
      [experiment.slug]
    ).catch(() => [] as SegmentRow[]),
  ]);

  return {
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
    segments,
    readout: latestReadout ?? null,
  };
}
