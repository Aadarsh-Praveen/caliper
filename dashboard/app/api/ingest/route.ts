import { z } from "zod";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";
import { getApiKeyFromRequest, getCustomerByApiKey } from "@/lib/auth";
import { batchPutEvents } from "@/lib/dynamodb";

const EventSchema = z.object({
  event_name: z.string().min(1),
  experiment_id: z.string().min(1),
  variant: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).default({}),
  ts: z.string(),
  context: z.record(z.string(), z.unknown()).default({}),
});

const IngestSchema = z.object({
  user_id: z.string().min(1),
  events: z.array(EventSchema).min(1),
});

export async function OPTIONS() {
  return corsOptionsResponse();
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

  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return corsResponse({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { user_id, events } = parsed.data;

  await batchPutEvents(
    events.map((e) => ({
      experimentId: e.experiment_id,
      userId: user_id,
      eventName: e.event_name,
      properties: e.properties,
      context: e.context,
      ts: e.ts,
    }))
  );

  return corsResponse({ ingested: events.length }, 202);
}
