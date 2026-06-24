import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const readoutCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM readouts r
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1`,
    [customer.id]
  );

  const experimentCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM experiments WHERE customer_id = $1`,
    [customer.id]
  );

  const dbtLastRun = await queryOne<{ max_computed_at: string }>(
    `SELECT MAX(computed_at)::text as max_computed_at FROM mart_segment_results`
  );

  const totalEvents = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_events`
  );

  const totalAssignments = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_assignments`
  );

  return corsResponse({
    counts: {
      readouts_generated: parseInt(readoutCount?.count || "0", 10),
      experiments_created: parseInt(experimentCount?.count || "0", 10),
      events_ingested: parseInt(totalEvents?.count || "0", 10),
      assignments_total: parseInt(totalAssignments?.count || "0", 10),
    },
    dbt_last_run: dbtLastRun?.max_computed_at || null,
  });
}
