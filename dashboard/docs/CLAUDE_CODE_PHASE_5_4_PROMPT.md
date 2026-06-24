# Caliper Phase 5.4 — Live Charts Across Dashboard, Experiments, and Detail Pages

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

We're adding professional data visualizations to three pages:

1. **Dashboard** — events-over-time chart + cumulative-lift sparklines on each experiment card
2. **Experiments list** — cumulative-lift sparklines on each experiment card
3. **Experiment detail page** — lift trend line chart, cumulative conversion rate chart, and funnel chart

**Critical rule**: NO HARDCODED DATA. Every chart pulls from live SQL queries against `raw_events`, `raw_assignments`, and the existing aggregator/dbt tables. All charts update as new data flows in.

**Chart library**: Recharts 3.8.x (latest stable). Funnel chart support is built-in via `<FunnelChart>` + `<Funnel>` + `<Trapezoid>`. Sparklines use the same `<LineChart>` component sized tiny.

## 1. Pre-flight — install Recharts

In `dashboard/`:

```bash
npm install recharts
```

Verify in `dashboard/package.json` that the version is `^3.0.0` or newer. If you already have a `recharts` entry that's older (e.g. 2.x), upgrade it.

## 2. Files to create or modify

```
dashboard/lib/timeseries.ts                              ← CREATE shared timeseries SQL functions
dashboard/app/api/dashboard/timeseries/route.ts          ← CREATE Dashboard timeseries endpoint
dashboard/app/api/experiments/[id]/timeseries/route.ts   ← CREATE experiment timeseries endpoint
dashboard/components/charts/EventsOverTimeChart.tsx      ← CREATE Dashboard chart component
dashboard/components/charts/LiftSparkline.tsx            ← CREATE small sparkline component
dashboard/components/charts/LiftTrendChart.tsx           ← CREATE detail page lift trend chart
dashboard/components/charts/ConversionRateChart.tsx     ← CREATE detail page conversion rate chart
dashboard/components/charts/ConversionFunnel.tsx        ← CREATE detail page funnel chart
dashboard/app/(dashboard)/dashboard/page.tsx             ← MODIFY add chart components
dashboard/app/(dashboard)/experiments/page.tsx           ← MODIFY add sparklines to cards
dashboard/app/(dashboard)/experiments/[id]/page.tsx      ← MODIFY add 3 charts
dashboard/lib/types.ts                                   ← ADD TimeseriesData types
```

## 3. Step-by-step

### Step 1 — Create shared timeseries query module

Create `dashboard/lib/timeseries.ts`:

```typescript
import { query } from "./postgres";

export interface DailyMetricVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface DailyExperimentLift {
  day: string;
  control_n: number;
  control_conversions: number;
  control_rate: number;
  treatment_n: number;
  treatment_conversions: number;
  treatment_rate: number;
  lift_pct: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

// Returns daily event volume per primary metric for the last 7 days
export async function getDailyMetricVolume(): Promise<DailyMetricVolume[]> {
  const rows = await query<{ day: string; event_name: string; count: number }>(
    `WITH primary_metrics AS (
       SELECT DISTINCT primary_metric FROM experiments
     )
     SELECT 
       TO_CHAR(DATE(ts), 'YYYY-MM-DD') as day,
       event_name,
       COUNT(*)::int as count
     FROM raw_events 
     WHERE event_name IN (SELECT primary_metric FROM primary_metrics)
       AND ts > NOW() - INTERVAL '7 days'
     GROUP BY DATE(ts), event_name
     ORDER BY day ASC`
  );
  return rows;
}

// Returns daily lift snapshots for one experiment, last 7 days, cumulative
export async function getExperimentDailyLift(
  experimentSlug: string,
  primaryMetric: string
): Promise<DailyExperimentLift[]> {
  // Use a cumulative approach: for each day, compute the lift using
  // all events/assignments up to and including that day
  const rows = await query<any>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '7 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     ),
     cumulative_assignments AS (
       SELECT 
         d.day,
         a.variant,
         COUNT(DISTINCT a.user_id) as n
       FROM days d
       LEFT JOIN raw_assignments a 
         ON a.experiment_id = $1 
         AND a.assigned_at::date <= d.day
       GROUP BY d.day, a.variant
     ),
     cumulative_conversions AS (
       SELECT 
         d.day,
         a.variant,
         COUNT(DISTINCT e.user_id) as conversions
       FROM days d
       LEFT JOIN raw_assignments a ON a.experiment_id = $1
       LEFT JOIN raw_events e 
         ON e.experiment_id = $1
         AND e.user_id = a.user_id
         AND e.event_name = $2
         AND e.ts::date <= d.day
       WHERE a.assigned_at::date <= d.day
       GROUP BY d.day, a.variant
     )
     SELECT 
       TO_CHAR(ca.day, 'YYYY-MM-DD') as day,
       MAX(CASE WHEN ca.variant = 'control' THEN ca.n ELSE 0 END)::int as control_n,
       MAX(CASE WHEN cc.variant = 'control' THEN cc.conversions ELSE 0 END)::int as control_conversions,
       MAX(CASE WHEN ca.variant = 'treatment' THEN ca.n ELSE 0 END)::int as treatment_n,
       MAX(CASE WHEN cc.variant = 'treatment' THEN cc.conversions ELSE 0 END)::int as treatment_conversions
     FROM cumulative_assignments ca
     LEFT JOIN cumulative_conversions cc 
       ON ca.day = cc.day AND ca.variant = cc.variant
     GROUP BY ca.day
     ORDER BY ca.day ASC`,
    [experimentSlug, primaryMetric]
  );

  // Compute conversion rates and lift
  return rows.map((r: any) => {
    const control_rate = r.control_n > 0 ? r.control_conversions / r.control_n : 0;
    const treatment_rate = r.treatment_n > 0 ? r.treatment_conversions / r.treatment_n : 0;
    const lift_pct = control_rate > 0 ? ((treatment_rate - control_rate) / control_rate) * 100 : 0;
    return {
      day: r.day,
      control_n: r.control_n,
      control_conversions: r.control_conversions,
      control_rate,
      treatment_n: r.treatment_n,
      treatment_conversions: r.treatment_conversions,
      treatment_rate,
      lift_pct,
    };
  });
}

// Returns funnel for an experiment — counts at each step
export async function getExperimentFunnel(
  experimentSlug: string,
  primaryMetric: string
): Promise<FunnelStep[]> {
  // Step 1: Total assigned
  const assignedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count 
     FROM raw_assignments 
     WHERE experiment_id = $1`,
    [experimentSlug]
  );
  const assigned = assignedRow[0]?.count || 0;

  // Step 2: Users who fired ANY event (exposure)
  const exposedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1`,
    [experimentSlug]
  );
  const exposed = exposedRow[0]?.count || 0;

  // Step 3: Users who fired an intermediate event (e.g., hero_view, page_view interaction)
  // We pick the second most common event name for this experiment as the intermediate step
  const intermediateRow = await query<{ event_name: string; count: number }>(
    `SELECT event_name, COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1 AND event_name != $2
     GROUP BY event_name
     ORDER BY count DESC
     LIMIT 1`,
    [experimentSlug, primaryMetric]
  );
  const intermediate = intermediateRow[0]?.count || 0;
  const intermediateName = intermediateRow[0]?.event_name || "engagement";

  // Step 4: Users who fired the primary metric (conversion)
  const convertedRow = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int as count
     FROM raw_events
     WHERE experiment_id = $1 AND event_name = $2`,
    [experimentSlug, primaryMetric]
  );
  const converted = convertedRow[0]?.count || 0;

  const steps: FunnelStep[] = [
    { step: "Assigned", count: assigned, drop_off_pct: null },
    { 
      step: "Exposed", 
      count: exposed, 
      drop_off_pct: assigned > 0 ? ((assigned - exposed) / assigned) * 100 : null 
    },
    { 
      step: intermediateName, 
      count: intermediate, 
      drop_off_pct: exposed > 0 ? ((exposed - intermediate) / exposed) * 100 : null 
    },
    { 
      step: primaryMetric, 
      count: converted, 
      drop_off_pct: intermediate > 0 ? ((intermediate - converted) / intermediate) * 100 : null 
    },
  ];

  return steps;
}
```

### Step 2 — Create Dashboard timeseries API endpoint

Create `dashboard/app/api/dashboard/timeseries/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query } from "@/lib/postgres";
import { getDailyMetricVolume, getExperimentDailyLift } from "@/lib/timeseries";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // Get daily event volume
  const dailyVolume = await getDailyMetricVolume();

  // Get sparkline data for each active experiment
  const experiments = await query<{ id: string; slug: string; primary_metric: string }>(
    `SELECT id, slug, primary_metric FROM experiments 
     WHERE customer_id = $1 AND status = 'running'`,
    [customer.id]
  );

  const sparklines: Record<string, Array<{ day: string; lift_pct: number }>> = {};
  for (const exp of experiments) {
    const series = await getExperimentDailyLift(exp.slug, exp.primary_metric);
    sparklines[exp.id] = series.map((s) => ({ day: s.day, lift_pct: s.lift_pct }));
  }

  return corsResponse({
    daily_volume: dailyVolume,
    sparklines,
  });
}
```

### Step 3 — Create experiment timeseries API endpoint

Create `dashboard/app/api/experiments/[id]/timeseries/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { 
  getExperimentDailyLift, 
  getExperimentFunnel 
} from "@/lib/timeseries";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // Load experiment to get slug and primary metric
  const experiment = await queryOne<{ slug: string; primary_metric: string }>(
    `SELECT slug, primary_metric FROM experiments 
     WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );

  if (!experiment) {
    return corsResponse({ error: "Experiment not found" }, 404);
  }

  const [dailyLift, funnel] = await Promise.all([
    getExperimentDailyLift(experiment.slug, experiment.primary_metric),
    getExperimentFunnel(experiment.slug, experiment.primary_metric),
  ]);

  return corsResponse({
    daily_lift: dailyLift,
    funnel,
  });
}
```

### Step 4 — Create the EventsOverTimeChart component

Create `dashboard/components/charts/EventsOverTimeChart.tsx`:

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyVolumeRow {
  day: string;
  event_name: string;
  count: number;
}

interface Props {
  data: DailyVolumeRow[];
}

const COLORS = ["#0058be", "#2563eb", "#7c3aed", "#a855f7", "#c084fc"];

export function EventsOverTimeChart({ data }: Props) {
  // Pivot the data: one row per day, columns per event_name
  const days = Array.from(new Set(data.map((d) => d.day))).sort();
  const metrics = Array.from(new Set(data.map((d) => d.event_name)));

  const chartData = days.map((day) => {
    const row: any = { day };
    for (const metric of metrics) {
      row[metric] = data.find((d) => d.day === day && d.event_name === metric)?.count || 0;
    }
    return row;
  });

  if (chartData.length === 0) {
    return (
      <div className="text-center text-[#727785] py-8">No event data in the last 7 days.</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis 
          dataKey="day" 
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis 
          stroke="#727785" 
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString()}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: "white", 
            border: "1px solid #c2c6d6", 
            borderRadius: "8px",
            fontSize: "12px"
          }}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        {metrics.map((metric, i) => (
          <Bar 
            key={metric}
            dataKey={metric}
            stackId="a"
            fill={COLORS[i % COLORS.length]}
            radius={i === metrics.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Step 5 — Create the LiftSparkline component

Create `dashboard/components/charts/LiftSparkline.tsx`:

```tsx
"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface SparklineRow {
  day: string;
  lift_pct: number;
}

interface Props {
  data: SparklineRow[];
  width?: number;
  height?: number;
}

export function LiftSparkline({ data, width = 100, height = 32 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="flex items-center justify-center text-[10px] text-[#c2c6d6]"
      >
        no data
      </div>
    );
  }

  // Decide color based on the most recent lift value
  const lastLift = data[data.length - 1]?.lift_pct ?? 0;
  const color = lastLift > 1 ? "#10b981" : lastLift < -1 ? "#ef4444" : "#727785";

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Line
            type="monotone"
            dataKey="lift_pct"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Step 6 — Create the LiftTrendChart component (for detail page)

Create `dashboard/components/charts/LiftTrendChart.tsx`:

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface DailyLiftRow {
  day: string;
  lift_pct: number;
  control_rate: number;
  treatment_rate: number;
}

interface Props {
  data: DailyLiftRow[];
}

export function LiftTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center text-[#727785] py-8">No daily lift data yet.</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis 
          dataKey="day"
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis 
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          label={{ value: "Lift (%)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#727785" } }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: "white", 
            border: "1px solid #c2c6d6", 
            borderRadius: "8px",
            fontSize: "12px"
          }}
          formatter={(value: any) => `${value.toFixed(2)}%`}
        />
        <ReferenceLine y={0} stroke="#c2c6d6" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="lift_pct"
          stroke="#0058be"
          strokeWidth={2}
          dot={{ r: 4, fill: "#0058be" }}
          activeDot={{ r: 6 }}
          name="Cumulative lift"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Step 7 — Create the ConversionRateChart component (for detail page)

Create `dashboard/components/charts/ConversionRateChart.tsx`:

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyLiftRow {
  day: string;
  control_rate: number;
  treatment_rate: number;
}

interface Props {
  data: DailyLiftRow[];
}

export function ConversionRateChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center text-[#727785] py-8">No data yet.</div>
    );
  }

  const chartData = data.map((d) => ({
    day: d.day,
    control: d.control_rate * 100,
    treatment: d.treatment_rate * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis 
          dataKey="day"
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis 
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          label={{ value: "Conversion rate", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#727785" } }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: "white", 
            border: "1px solid #c2c6d6", 
            borderRadius: "8px",
            fontSize: "12px"
          }}
          formatter={(value: any) => `${value.toFixed(2)}%`}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Line
          type="monotone"
          dataKey="control"
          stroke="#727785"
          strokeWidth={2}
          dot={{ r: 3, fill: "#727785" }}
          name="Control"
        />
        <Line
          type="monotone"
          dataKey="treatment"
          stroke="#0058be"
          strokeWidth={2}
          dot={{ r: 3, fill: "#0058be" }}
          name="Treatment"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Step 8 — Create the ConversionFunnel component (for detail page)

Create `dashboard/components/charts/ConversionFunnel.tsx`:

```tsx
"use client";

import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

interface Props {
  data: FunnelStep[];
}

const COLORS = ["#0058be", "#2563eb", "#7c3aed", "#a855f7"];

export function ConversionFunnel({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center text-[#727785] py-8">No funnel data yet.</div>
    );
  }

  // Recharts Funnel needs: value, fill, name
  const funnelData = data.map((step, i) => ({
    name: step.step,
    value: step.count,
    fill: COLORS[i % COLORS.length],
    drop_off_pct: step.drop_off_pct,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <FunnelChart>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "white", 
              border: "1px solid #c2c6d6", 
              borderRadius: "8px",
              fontSize: "12px"
            }}
            formatter={(value: any) => value.toLocaleString()}
          />
          <Funnel
            dataKey="value"
            data={funnelData}
            isAnimationActive
            stroke="#fff"
            strokeWidth={2}
          >
            <LabelList
              position="right"
              fill="#0b1c30"
              stroke="none"
              dataKey="name"
              style={{ fontSize: "12px", fontWeight: 500 }}
            />
            <LabelList
              position="center"
              fill="#fff"
              stroke="none"
              dataKey="value"
              style={{ fontSize: "13px", fontWeight: 600 }}
              formatter={(v: any) => v.toLocaleString()}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>

      {/* Drop-off table below the funnel */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        {data.map((step, i) => (
          <div key={step.step} className="bg-white border border-[#c2c6d6] rounded-lg p-3">
            <p className="font-mono text-[#0b1c30] truncate" title={step.step}>
              {step.step}
            </p>
            <p className="font-bold text-[#0b1c30] tabular-nums mt-1 text-base">
              {step.count.toLocaleString()}
            </p>
            {step.drop_off_pct !== null && (
              <p className="text-[#727785] tabular-nums">
                {step.drop_off_pct > 0 ? "-" : ""}{Math.abs(step.drop_off_pct).toFixed(1)}% drop
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 9 — Wire EventsOverTimeChart into Dashboard page

In `dashboard/app/(dashboard)/dashboard/page.tsx`:

Add to the imports:
```typescript
import { EventsOverTimeChart } from "@/components/charts/EventsOverTimeChart";
import { LiftSparkline } from "@/components/charts/LiftSparkline";
```

Update the data fetching to also load timeseries:
```tsx
// At the top of DashboardPage, after fetching dashboard data:
async function fetchTimeseries() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const res = await fetch(`${protocol}://${host}/api/dashboard/timeseries`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function DashboardPage() {
  const [data, timeseries] = await Promise.all([fetchDashboardData(), fetchTimeseries()]);
  // ...
}
```

**Add the chart between KPI cards and the Active Experiments / Activity Feed section:**

```tsx
{/* Events over time chart */}
<div className="mb-8">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-lg font-bold text-[#0b1c30]">Event Volume</h2>
      <p className="text-xs text-[#727785]">Daily events ingested by primary metric · Last 7 days</p>
    </div>
  </div>
  <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
    {timeseries?.daily_volume ? (
      <EventsOverTimeChart data={timeseries.daily_volume} />
    ) : (
      <div className="text-center text-[#727785] py-8">Loading event data…</div>
    )}
  </div>
</div>
```

**Add LiftSparkline to each experiment card** in the Active Experiments section. Right after the "Lift" display, insert:

```tsx
{timeseries?.sparklines?.[exp.id] && (
  <div className="mt-2">
    <LiftSparkline data={timeseries.sparklines[exp.id]} width={120} height={28} />
  </div>
)}
```

### Step 10 — Wire LiftSparkline into Experiments list page

In `dashboard/app/(dashboard)/experiments/page.tsx`:

Fetch the same Dashboard timeseries endpoint to get sparkline data. Add to each experiment card a small `<LiftSparkline>` in the right column.

Reuse the same `LiftSparkline` component. Pass `data={sparklines[exp.id]}` per card.

### Step 11 — Wire all three charts into Experiment detail page

In `dashboard/app/(dashboard)/experiments/[id]/page.tsx`:

Add a new fetcher:
```tsx
async function fetchTimeseries(id: string) {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const res = await fetch(`${protocol}://${host}/api/experiments/${id}/timeseries`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}
```

Call it alongside the existing results fetch.

Add three new sections, **between the existing stats cards and the segment breakdown**:

```tsx
{/* Lift trend chart */}
<section className="mb-8 bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="mb-4">
    <h3 className="text-lg font-bold text-[#0b1c30]">Cumulative Lift Trend</h3>
    <p className="text-xs text-[#727785]">How treatment vs control lift has evolved day-over-day</p>
  </div>
  {timeseries?.daily_lift ? (
    <LiftTrendChart data={timeseries.daily_lift} />
  ) : (
    <div className="text-center text-[#727785] py-8">Loading lift trend…</div>
  )}
</section>

{/* Conversion rate chart */}
<section className="mb-8 bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="mb-4">
    <h3 className="text-lg font-bold text-[#0b1c30]">Conversion Rate by Variant</h3>
    <p className="text-xs text-[#727785]">Control vs treatment conversion rate trajectory</p>
  </div>
  {timeseries?.daily_lift ? (
    <ConversionRateChart data={timeseries.daily_lift} />
  ) : (
    <div className="text-center text-[#727785] py-8">Loading conversion rates…</div>
  )}
</section>

{/* Funnel chart */}
<section className="mb-8 bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="mb-4">
    <h3 className="text-lg font-bold text-[#0b1c30]">Conversion Funnel</h3>
    <p className="text-xs text-[#727785]">User flow from assignment to primary metric conversion</p>
  </div>
  {timeseries?.funnel ? (
    <ConversionFunnel data={timeseries.funnel} />
  ) : (
    <div className="text-center text-[#727785] py-8">Loading funnel data…</div>
  )}
</section>
```

Place these between the existing CUPED/mSPRT cards (or stats cards) and the segment breakdown table.

### Step 12 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface DailyMetricVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface DailyExperimentLift {
  day: string;
  control_n: number;
  control_conversions: number;
  control_rate: number;
  treatment_n: number;
  treatment_conversions: number;
  treatment_rate: number;
  lift_pct: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

export interface ExperimentTimeseries {
  daily_lift: DailyExperimentLift[];
  funnel: FunnelStep[];
}

export interface DashboardTimeseries {
  daily_volume: DailyMetricVolume[];
  sparklines: Record<string, Array<{ day: string; lift_pct: number }>>;
}
```

## 4. Definition of done

Before declaring complete:

1. ✅ `npm install recharts` succeeded; verify `recharts@^3.0.0` in package.json
2. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
3. ✅ `/dashboard` shows the Events Over Time stacked bar chart with real data
4. ✅ Each experiment card on Dashboard has a small line sparkline
5. ✅ `/experiments` cards each show a sparkline in the right column
6. ✅ `/experiments/[id]` detail pages show:
   - Cumulative Lift Trend line chart
   - Conversion Rate by Variant (two lines, control vs treatment)
   - Conversion Funnel with 4 steps and drop-off table below
7. ✅ All chart data updates when new events arrive — no hardcoded values anywhere
8. ✅ Charts render with the existing color palette (#0058be primary, #727785 muted)
9. ✅ Tooltips appear on hover with formatted numbers

## 5. Common issues to watch for

**Issue: Charts don't render in production**
Recharts needs `"use client"` at the top of every chart component file. Verify each component file has it.

**Issue: Funnel chart looks weird**
The Recharts Funnel expects values in descending order. Our query should produce that naturally (assigned > exposed > intermediate > converted), but verify with a console.log of the data before passing to the chart.

**Issue: Sparkline is empty**
The `data` array might be empty if Aurora hasn't been populated correctly. Check the API response in browser DevTools Network tab.

**Issue: SQL query is slow**
The cumulative-lift query joins assignments and events for each day. At 30K events / 10K assignments it should run in <500ms. If slower, add indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_raw_events_exp_user_event ON raw_events (experiment_id, user_id, event_name);
CREATE INDEX IF NOT EXISTS idx_raw_assignments_exp_date ON raw_assignments (experiment_id, assigned_at);
```

## 6. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/dashboard` showing the EventsOverTimeChart and sparklines
3. Screenshot of `/experiments` list showing sparklines on each card
4. Screenshot of `/experiments/[id]` (use `hero_cta_test` or `buy_button_test`) showing all 3 new charts
5. Confirmation that the funnel chart shows real step counts (not placeholder numbers)

If anything fails, stop and tell me.

---

Begin. Execute steps in order 1 → 12. Verify each step before moving on. Don't proceed past Step 1 (recharts install) until that's confirmed working.
