import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query, queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

function classifyEvent(eventName: string, primaryMetrics: Set<string>): string {
  if (primaryMetrics.has(eventName)) return "Primary";
  if (eventName === "page_view" || eventName === "pageview") return "Pageview";
  if (eventName === "experiment_exposed" || eventName === "$assignment") return "System";
  if (
    eventName.startsWith("scroll_") ||
    eventName.includes("_view") ||
    eventName.includes("hover")
  )
    return "Engagement";
  return "Custom";
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // Load experiments to get primary metrics
  const experiments = await query<{
    id: string;
    slug: string;
    name: string;
    primary_metric: string;
    metric_type: string;
  }>(
    `SELECT id, slug, name, primary_metric, metric_type FROM experiments WHERE customer_id = $1`,
    [customer.id]
  );

  const primaryMetricsSet = new Set(experiments.map((e) => e.primary_metric));

  // Build metric registry — one entry per distinct primary_metric
  const metricMap = new Map<
    string,
    {
      event_name: string;
      metric_type: string;
      experiments: Array<{ id: string; name: string; slug: string }>;
      total_events_7d: number;
      unique_users_7d: number;
      avg_conversion_rate: number | null;
    }
  >();

  for (const exp of experiments) {
    if (!metricMap.has(exp.primary_metric)) {
      metricMap.set(exp.primary_metric, {
        event_name: exp.primary_metric,
        metric_type: exp.metric_type,
        experiments: [],
        total_events_7d: 0,
        unique_users_7d: 0,
        avg_conversion_rate: null,
      });
    }
    metricMap.get(exp.primary_metric)!.experiments.push({
      id: exp.id,
      name: exp.name,
      slug: exp.slug,
    });
  }

  // Fetch event counts for each primary metric over last 7 days
  for (const [metricName, item] of metricMap) {
    const stats = await queryOne<{ event_count: string; user_count: string }>(
      `SELECT COUNT(*)::text as event_count, COUNT(DISTINCT user_id)::text as user_count
       FROM raw_events
       WHERE event_name = $1 AND ts > NOW() - INTERVAL '7 days'`,
      [metricName]
    );
    item.total_events_7d = parseInt(stats?.event_count || "0", 10);
    item.unique_users_7d = parseInt(stats?.user_count || "0", 10);

    // Conversion rate: unique converters / unique assigned users (using slug as experiment_id in raw tables)
    const slugs = item.experiments.map((e) => e.slug);
    if (slugs.length > 0) {
      const assignmentRow = await queryOne<{ count: string }>(
        `SELECT COUNT(DISTINCT user_id)::text as count
         FROM raw_assignments
         WHERE experiment_id = ANY($1::text[])`,
        [slugs]
      );
      const assignedUsers = parseInt(assignmentRow?.count || "0", 10);
      if (assignedUsers > 0) {
        item.avg_conversion_rate = item.unique_users_7d / assignedUsers;
      }
    }
  }

  const registry = Array.from(metricMap.values());

  // Daily volume for primary metrics over last 7 days
  const primaryMetricList = Array.from(metricMap.keys());
  const dailyVolume = await query<{ day: string; event_name: string; count: number }>(
    `SELECT
       TO_CHAR(DATE(ts), 'YYYY-MM-DD') as day,
       event_name,
       COUNT(*)::int as count
     FROM raw_events
     WHERE event_name = ANY($1::text[])
       AND ts > NOW() - INTERVAL '7 days'
     GROUP BY DATE(ts), event_name
     ORDER BY day ASC`,
    [primaryMetricList]
  );

  // Event taxonomy — all distinct event types
  const taxonomyRaw = await query<{
    event_name: string;
    total: string;
    users: string;
    first_seen: string;
    last_seen: string;
  }>(
    `SELECT
       event_name,
       COUNT(*)::text as total,
       COUNT(DISTINCT user_id)::text as users,
       MIN(ts)::text as first_seen,
       MAX(ts)::text as last_seen
     FROM raw_events
     GROUP BY event_name
     ORDER BY COUNT(*) DESC
     LIMIT 20`
  );

  const taxonomy = taxonomyRaw.map((row) => ({
    event_name: row.event_name,
    type: classifyEvent(row.event_name, primaryMetricsSet),
    total_events: parseInt(row.total, 10),
    unique_users: parseInt(row.users, 10),
    first_seen: row.first_seen,
    last_seen: row.last_seen,
  }));

  return corsResponse({
    registry,
    daily_volume: dailyVolume,
    taxonomy,
    range_days: 7,
  });
}
