import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { getAssignment, putAssignment } from "@/lib/dynamodb";
import { queryOne } from "@/lib/postgres";
import { assignVariant } from "@/lib/hash";
import { waitUntil } from "@vercel/functions";
import { insertRawAssignment } from "@/lib/postgres-batch";
import type { Experiment } from "@/lib/types";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: Request) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing X-API-Key header" }, 401);

  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");
  const experiment_id = url.searchParams.get("experiment_id");

  if (!user_id || !experiment_id) {
    return corsResponse({ error: "Missing user_id or experiment_id" }, 400);
  }

  const existing = await getAssignment(experiment_id, user_id);
  if (existing) {
    return corsResponse({ variant: existing.variant, experiment_id, assigned_at: existing.assigned_at });
  }

  const experiment = await queryOne<Pick<Experiment, "id" | "slug" | "variants" | "status">>(
    `SELECT id, slug, variants, status FROM experiments WHERE slug = $1 AND customer_id = $2`,
    [experiment_id, customer.id]
  );

  if (!experiment) return corsResponse({ error: "Experiment not found" }, 404);

  if (experiment.status !== "running" && experiment.status !== "draft") {
    return corsResponse({ error: "Experiment is not active" }, 400);
  }

  const variant = assignVariant(user_id, experiment_id, experiment.variants);

  await putAssignment(experiment_id, user_id, variant, "api");

  // Re-read in case of a race to get the canonical assignment
  const final = await getAssignment(experiment_id, user_id);
  const assignedVariant = final?.variant ?? variant;
  const assignedAt = final?.assigned_at ?? new Date().toISOString();

  // Aurora dual-write — fire-and-forget, failures don't block the response
  // experiment_id param is already the slug (confirmed by WHERE slug = $1 lookup above)
  waitUntil(
    insertRawAssignment({
      experiment_id: experiment.slug,
      user_id,
      variant: assignedVariant,
      pre_experiment_activity: null,
      assigned_at: assignedAt,
    }).catch((err) => {
      console.warn("[assign] Aurora dual-write failed:", err);
    })
  );

  return corsResponse({
    variant: assignedVariant,
    experiment_id,
    assigned_at: assignedAt,
  });
}
