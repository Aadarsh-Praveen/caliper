import { z } from "zod";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import type { Experiment } from "@/lib/types";
import type { NextRequest } from "next/server";

const PatchSchema = z.object({
  status: z.enum(["running", "stopped", "completed"]),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["running"],
  running: ["stopped", "completed"],
  stopped: ["running", "completed"],
  completed: [],
};

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

  return corsResponse(experiment);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return corsResponse({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { status: newStatus } = parsed.data;

  const experiment = await queryOne<Experiment>(
    `SELECT * FROM experiments WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );

  if (!experiment) return corsResponse({ error: "Experiment not found" }, 404);

  const allowed = VALID_TRANSITIONS[experiment.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return corsResponse(
      { error: `Cannot transition from '${experiment.status}' to '${newStatus}'` },
      400
    );
  }

  let updateQuery: string;
  let sqlParams: unknown[];

  if (newStatus === "running" && experiment.status !== "running") {
    updateQuery = `UPDATE experiments SET status = $1, started_at = now() WHERE id = $2 AND customer_id = $3 RETURNING *`;
    sqlParams = [newStatus, id, customer.id];
  } else if (newStatus === "stopped" || newStatus === "completed") {
    updateQuery = `UPDATE experiments SET status = $1, stopped_at = now() WHERE id = $2 AND customer_id = $3 RETURNING *`;
    sqlParams = [newStatus, id, customer.id];
  } else {
    updateQuery = `UPDATE experiments SET status = $1 WHERE id = $2 AND customer_id = $3 RETURNING *`;
    sqlParams = [newStatus, id, customer.id];
  }

  const updated = await queryOne<Experiment>(updateQuery, sqlParams);
  return corsResponse(updated);
}
