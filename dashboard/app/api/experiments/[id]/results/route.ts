import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { computeExperimentResults } from "@/lib/experiment-results";
import type { Experiment } from "@/lib/types";
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

  const results = await computeExperimentResults(experiment);

  return corsResponse(results);
}
