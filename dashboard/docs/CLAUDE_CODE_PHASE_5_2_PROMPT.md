# Caliper Phase 5.2 — Metrics Page

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

The sidebar nav has a "Metrics" item currently marked as disabled ("soon"). We're now building the real Metrics page.

This page sits at `/metrics` — same `(dashboard)` route group, same sidebar layout as Dashboard and Experiments.

The page has three sections:

1. **Metric Registry** — 3 cards, one per primary metric currently tracked by an experiment
2. **Event Volume Chart** — vertical stacked bar chart showing daily event counts over the last 7 days, broken down by primary metric
3. **Event Taxonomy Table** — list of ALL event types fired by the SDK, with counts and timestamps

All data comes from real tables — primarily `raw_events`, joined with `experiments` for metric type info.

## 1. Files to create or modify

```
dashboard/app/(dashboard)/metrics/page.tsx        ← CREATE the new Metrics page
dashboard/app/api/metrics/route.ts                ← CREATE API endpoint
dashboard/app/(dashboard)/layout.tsx              ← ENABLE the Metrics nav link (remove disabled)
dashboard/lib/types.ts                            ← ADD MetricsPageData type
```

## 2. Step-by-step

### Step 1 — Enable the Metrics nav link

In `dashboard/app/(dashboard)/layout.tsx`, change the Metrics nav item:

**Before:**
```typescript
{ label: "Metrics", href: "/metrics", icon: BarChart2, disabled: true },
```

**After:**
```typescript
{ label: "Metrics", href: "/metrics", icon: BarChart2 },
```

(Just remove `, disabled: true`. Settings stays disabled.)

### Step 2 — Build the Metrics API endpoint

Create `dashboard/app/api/metrics/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query, queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

interface MetricRegistryItem {
  event_name: string;
  metric_type: string;
  experiments: Array<{ id: string; name: string; slug: string }>;
  total_events_7d: number;
  unique_users_7d: number;
  avg_conversion_rate: number | null;
}

interface DailyVolumeRow {
  day: string;
  event_name: string;
  count: number;
}

interface EventTaxonomyRow {
  event_name: string;
  type: string;
  total_events: number;
  unique_users: number;
  first_seen: string;
  last_seen: string;
}

// Classify event types for the taxonomy table
function classifyEvent(eventName: string, primaryMetrics: Set<string>): string {
  if (primaryMetrics.has(eventName)) return "Primary";
  if (eventName === "page_view" || eventName === "pageview") return "Pageview";
  if (eventName === "experiment_exposed" || eventName === "$assignment") return "System";
  if (eventName.startsWith("scroll_") || eventName.includes("_view") || eventName.includes("hover")) return "Engagement";
  return "Custom";
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // 1. Load primary metrics from experiments table
  const experiments = await query<{ id: string; slug: string; name: string; primary_metric: string; metric_type: string }>(
    `SELECT id, slug, name, primary_metric, metric_type 
     FROM experiments 
     WHERE customer_id = $1`,
    [customer.id]
  );

  const primaryMetricsSet = new Set(experiments.map((e) => e.primary_metric));

  // 2. Build Metric Registry — one entry per distinct primary_metric
  const registry: MetricRegistryItem[] = [];
  const metricMap = new Map<string, MetricRegistryItem>();

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

  // Fetch event counts for each primary metric in the last 7 days
  const sevenDaysAgo = "NOW() - INTERVAL '7 days'";
  for (const [metricName, item] of metricMap) {
    const stats = await queryOne<{ event_count: string; user_count: string }>(
      `SELECT 
         COUNT(*)::text as event_count,
         COUNT(DISTINCT user_id)::text as user_count
       FROM raw_events 
       WHERE event_name = $1 AND ts > ${sevenDaysAgo}`,
      [metricName]
    );
    item.total_events_7d = parseInt(stats?.event_count || "0", 10);
    item.unique_users_7d = parseInt(stats?.user_count || "0", 10);

    // Compute avg conversion rate: unique users with this event / unique users assigned to any experiment using this metric
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

    registry.push(item);
  }

  // 3. Build daily volume time series (last 7 days, per primary metric)
  const primaryMetricList = Array.from(metricMap.keys());
  const dailyVolume = await query<DailyVolumeRow>(
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

  // 4. Event Taxonomy — all distinct event names
  const taxonomyRaw = await query<{ event_name: string; total: string; users: string; first_seen: string; last_seen: string }>(
    `SELECT 
       event_name,
       COUNT(*)::text as total,
       COUNT(DISTINCT user_id)::text as users,
       MIN(ts)::text as first_seen,
       MAX(ts)::text as last_seen
     FROM raw_events
     GROUP BY event_name
     ORDER BY total::int DESC
     LIMIT 20`
  );

  const taxonomy: EventTaxonomyRow[] = taxonomyRaw.map((row) => ({
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
```

### Step 3 — Build the Metrics page

Create `dashboard/app/(dashboard)/metrics/page.tsx`:

```tsx
import { headers } from "next/headers";
import Link from "next/link";
import { 
  BarChart2, TrendingUp, Users, Activity, Eye, 
  MousePointerClick, Sparkles, Settings as SettingsIcon, ArrowRight 
} from "lucide-react";

const DEMO_API_KEY = "caliper_demo_key_public";

async function fetchMetricsData() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  
  const res = await fetch(`${protocol}://${host}/api/metrics`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Failed to fetch metrics:", await res.text());
    return null;
  }
  return res.json();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatRelativeTime(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  const diff = now - then;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Pick an icon based on the metric name
function metricIcon(eventName: string) {
  if (eventName.includes("cart") || eventName.includes("buy")) return MousePointerClick;
  if (eventName.includes("view")) return Eye;
  if (eventName.includes("click")) return MousePointerClick;
  return Activity;
}

// Color coding for event types in taxonomy
const TYPE_COLORS: Record<string, string> = {
  Primary: "bg-[#0058be]/[0.08] text-[#0058be]",
  Pageview: "bg-emerald-50 text-emerald-700",
  Engagement: "bg-amber-50 text-amber-700",
  System: "bg-zinc-100 text-zinc-600",
  Custom: "bg-purple-50 text-purple-700",
};

interface RegistryItem {
  event_name: string;
  metric_type: string;
  experiments: Array<{ id: string; name: string; slug: string }>;
  total_events_7d: number;
  unique_users_7d: number;
  avg_conversion_rate: number | null;
}

interface DailyVolumeRow {
  day: string;
  event_name: string;
  count: number;
}

interface TaxonomyRow {
  event_name: string;
  type: string;
  total_events: number;
  unique_users: number;
  first_seen: string;
  last_seen: string;
}

export default async function MetricsPage() {
  const data = await fetchMetricsData();

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Failed to load metrics data. Please refresh the page.
        </div>
      </div>
    );
  }

  const registry: RegistryItem[] = data.registry || [];
  const dailyVolume: DailyVolumeRow[] = data.daily_volume || [];
  const taxonomy: TaxonomyRow[] = data.taxonomy || [];

  // Aggregate daily volume into a structure suitable for stacked bar chart
  const days = Array.from(new Set(dailyVolume.map((d) => d.day))).sort();
  const metrics = Array.from(new Set(dailyVolume.map((d) => d.event_name)));
  const chartData = days.map((day) => {
    const row: any = { day };
    let total = 0;
    for (const metric of metrics) {
      const val = dailyVolume.find((d) => d.day === day && d.event_name === metric)?.count || 0;
      row[metric] = val;
      total += val;
    }
    row._total = total;
    return row;
  });

  const maxDailyTotal = Math.max(...chartData.map((c) => c._total), 1);

  // Color palette for the chart bars
  const colors = ["#0058be", "#2563eb", "#7c3aed", "#a855f7", "#c084fc"];
  const metricColors: Record<string, string> = {};
  metrics.forEach((m, i) => {
    metricColors[m] = colors[i % colors.length];
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0b1c30] mb-2">Metrics</h1>
        <p className="text-[#424754]">
          Event-level data flowing through your Caliper SDK — what's being tracked, how much, and how often.
        </p>
      </div>

      {/* Metric Registry — 3 cards */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#0b1c30]">Metric Registry</h2>
            <p className="text-xs text-[#727785]">Primary metrics tracked by your active experiments · Last 7 days</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {registry.map((item) => {
            const Icon = metricIcon(item.event_name);
            return (
              <div 
                key={item.event_name}
                className="bg-white border border-[#c2c6d6] rounded-xl p-5 hover:border-[#0058be]/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-[#eff4ff]">
                    <Icon size={18} className="text-[#0058be]" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#0058be] text-[10px] font-bold uppercase tracking-wider">
                    {item.metric_type}
                  </span>
                </div>
                
                <h3 className="font-mono text-sm font-semibold text-[#0b1c30] mb-1">
                  {item.event_name}
                </h3>
                <p className="text-xs text-[#727785] mb-4">
                  Used in {item.experiments.length} experiment{item.experiments.length !== 1 ? "s" : ""}
                </p>

                <div className="space-y-2 pt-3 border-t border-[#c2c6d6]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Events (7d)</span>
                    <span className="text-sm font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(item.total_events_7d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Unique users</span>
                    <span className="text-sm font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(item.unique_users_7d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Conversion rate</span>
                    <span className="text-sm font-semibold text-[#0058be] tabular-nums">
                      {item.avg_conversion_rate != null 
                        ? `${(item.avg_conversion_rate * 100).toFixed(2)}%`
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#c2c6d6]/50">
                  {item.experiments.map((exp) => (
                    <Link
                      key={exp.id}
                      href={`/experiments/${exp.id}`}
                      className="flex items-center justify-between py-1 text-xs text-[#0058be] hover:underline"
                    >
                      <span className="truncate">{exp.name}</span>
                      <ArrowRight size={12} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Event Volume Chart */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#0b1c30]">Event Volume</h2>
            <p className="text-xs text-[#727785]">Daily event count over the last 7 days, by metric</p>
          </div>
        </div>
        
        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          {chartData.length === 0 ? (
            <div className="text-center text-[#727785] py-8">No event data in the last 7 days.</div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-6 flex-wrap">
                {metrics.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-sm" 
                      style={{ backgroundColor: metricColors[m] }} 
                    />
                    <span className="text-xs font-mono text-[#424754]">{m}</span>
                  </div>
                ))}
              </div>

              {/* Stacked bar chart */}
              <div className="flex items-end justify-between gap-2 h-64">
                {chartData.map((dayData) => (
                  <div key={dayData.day} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex flex-col-reverse h-56 rounded overflow-hidden">
                      {metrics.map((metric) => {
                        const value = dayData[metric] || 0;
                        const heightPct = (value / maxDailyTotal) * 100;
                        if (value === 0) return null;
                        return (
                          <div
                            key={metric}
                            className="w-full transition-all hover:opacity-80"
                            style={{ 
                              backgroundColor: metricColors[metric],
                              height: `${heightPct}%`,
                            }}
                            title={`${metric}: ${value.toLocaleString()}`}
                          />
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-[#727785] tabular-nums">
                      {new Date(dayData.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className="text-xs font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(dayData._total)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Event Taxonomy Table */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#0b1c30]">Event Taxonomy</h2>
            <p className="text-xs text-[#727785]">All event types tracked by your Caliper SDK</p>
          </div>
        </div>

        <div className="bg-white border border-[#c2c6d6] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#f8f9ff] border-b border-[#c2c6d6]">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Event Name</th>
                <th className="px-5 py-3 text-left text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Type</th>
                <th className="px-5 py-3 text-right text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Total Events</th>
                <th className="px-5 py-3 text-right text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Unique Users</th>
                <th className="px-5 py-3 text-left text-[11px] uppercase tracking-wider text-[#424754] font-semibold">First Seen</th>
                <th className="px-5 py-3 text-left text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c2c6d6]/50">
              {taxonomy.map((row) => (
                <tr key={row.event_name} className="hover:bg-[#f8f9ff] transition-colors">
                  <td className="px-5 py-3">
                    <code className="text-sm font-mono text-[#0b1c30]">{row.event_name}</code>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${TYPE_COLORS[row.type] || TYPE_COLORS.Custom}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-sm text-[#0b1c30]">
                    {row.total_events.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-sm text-[#424754]">
                    {row.unique_users.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-[#727785]">
                    {formatRelativeTime(row.first_seen)}
                  </td>
                  <td className="px-5 py-3 text-xs text-[#727785]">
                    {formatRelativeTime(row.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

### Step 4 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface MetricRegistryItem {
  event_name: string;
  metric_type: string;
  experiments: Array<{ id: string; name: string; slug: string }>;
  total_events_7d: number;
  unique_users_7d: number;
  avg_conversion_rate: number | null;
}

export interface MetricsDailyVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface MetricsTaxonomyRow {
  event_name: string;
  type: string;
  total_events: number;
  unique_users: number;
  first_seen: string;
  last_seen: string;
}

export interface MetricsPageData {
  registry: MetricRegistryItem[];
  daily_volume: MetricsDailyVolume[];
  taxonomy: MetricsTaxonomyRow[];
  range_days: number;
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ Visiting `/metrics` returns the new page with real data (not 404)
3. ✅ The Metrics nav link in the sidebar is now enabled (no "soon" badge, clickable)
4. ✅ Clicking "Metrics" from any sidebar location navigates to `/metrics`
5. ✅ The Metrics nav item highlights as active (blue) when on `/metrics`
6. ✅ Three metric registry cards render: `buy_section_view`, `add_to_cart`, `nav_cta_click`
7. ✅ Each registry card shows real event counts, user counts, and conversion rate
8. ✅ Each registry card links to its corresponding experiment detail page
9. ✅ The Event Volume stacked bar chart renders with 7 bars (one per day) showing all 3 primary metrics
10. ✅ The Event Taxonomy table shows all event_name values from raw_events sorted by total descending
11. ✅ Type badges in the taxonomy table are color-coded (Primary in blue, Pageview in green, etc.)

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/metrics` on production (deploy via git push first)
3. Sample row counts: how many distinct event_names appear in the taxonomy table?

If anything fails, stop and tell me. Don't paper over errors.

---

Begin. Execute steps in order 1 → 2 → 3 → 4. Don't move on to a step until the previous one verifies.
