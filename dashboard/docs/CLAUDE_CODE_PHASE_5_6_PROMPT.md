# Caliper Phase 5.6 — Comparative Dashboard (3-Column Experiment Grid)

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

Restructuring the Dashboard page into a comparative view. Currently the page shows 4 KPIs at the top, an event volume chart, then a 2-column layout (active experiments + activity feed). We're replacing the experiments-and-activity row with a **3-column comparison grid** — one column per running experiment, each column showing the same set of charts so they can be visually compared at a glance.

Activity feed moves below the comparison grid to give the grid full width.

### Final page structure

```
1. Header (Dashboard / Workspace overview)
2. KPI cards row (4 cards with sparklines — unchanged)
3. Event Volume bar chart (full width — unchanged)
4. NEW: Experiment Comparison Grid (3 columns full width, one per running experiment)
   Each column contains:
   - Header: name + status badge + current lift (big)
   - Lift Trend chart (compact)
   - Conversion Rate chart (compact)
   - Funnel chart (compact)
   - Stats row: classical p, mSPRT p, CUPED %
5. Recent Activity (full width, moved below grid)
```

### Critical constraints

- **Reuse existing chart components from Phase 5.4** (`LiftTrendChart`, `ConversionRateChart`, `ConversionFunnel`). Don't rewrite them.
- **All data must come from existing API endpoints**. We're aggregating client-side from a new combined endpoint.
- **No hardcoded values anywhere**. Every chart pulls from `raw_events` + `raw_assignments` via the existing timeseries functions.
- **Each column must handle gracefully when an experiment has missing/sparse data** (e.g., the SRM-affected Nav Layout Test).

## 1. Files to create or modify

```
dashboard/app/api/dashboard/comparison/route.ts        ← CREATE new endpoint that fetches all running experiments' timeseries in one call
dashboard/components/dashboard/ExperimentColumn.tsx    ← CREATE single-column component (reused 3×)
dashboard/components/dashboard/ComparisonGrid.tsx      ← CREATE wrapper that lays out 3 columns
dashboard/app/(dashboard)/dashboard/page.tsx           ← MODIFY to use ComparisonGrid + restructure layout
dashboard/lib/types.ts                                 ← ADD ExperimentComparisonData type
dashboard/components/charts/LiftTrendChart.tsx         ← MODIFY to accept compact mode prop
dashboard/components/charts/ConversionRateChart.tsx    ← MODIFY to accept compact mode prop
dashboard/components/charts/ConversionFunnel.tsx       ← MODIFY to accept compact mode prop
```

## 2. Step-by-step

### Step 1 — Add compact mode to existing chart components

The existing chart components from Phase 5.4 are sized for the detail page (260-300px tall, generous margins). For the comparison grid, we need a compact variant — same charts, smaller dimensions, less label clutter.

**In `dashboard/components/charts/LiftTrendChart.tsx`**, add an optional `compact` prop:

```tsx
interface Props {
  data: DailyLiftRow[];
  compact?: boolean;   // ADD
}

export function LiftTrendChart({ data, compact = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className={`text-center text-[#727785] ${compact ? "py-4 text-xs" : "py-8"}`}>
        No daily lift data yet.
      </div>
    );
  }

  const height = compact ? 140 : 260;
  const tickSize = compact ? 9 : 11;
  const margin = compact 
    ? { top: 5, right: 5, left: -25, bottom: 0 }
    : { top: 10, right: 16, left: 0, bottom: 0 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis 
          dataKey="day"
          stroke="#727785"
          tick={{ fontSize: tickSize, fill: "#727785" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
          hide={compact}  // hide x-axis labels in compact mode
        />
        <YAxis 
          stroke="#727785"
          tick={{ fontSize: tickSize, fill: "#727785" }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          {...(compact ? {} : { label: { value: "Lift (%)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#727785" } } })}
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
          dot={compact ? false : { r: 4, fill: "#0058be" }}
          activeDot={{ r: 6 }}
          name="Cumulative lift"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**In `dashboard/components/charts/ConversionRateChart.tsx`**, apply the same pattern: add `compact?: boolean`, reduce height to 140px in compact mode, hide x-axis tick labels, hide legend, reduce margins.

**In `dashboard/components/charts/ConversionFunnel.tsx`**, add `compact?: boolean`. In compact mode:
- Reduce height from 300 to 180
- Hide the drop-off table (the 4-column grid below the funnel)
- Reduce label font size to 10px

If implementing the compact funnel is hard with Recharts (label sizing can be fiddly), it's acceptable to keep height at 180 and just not render the table below. The funnel shape itself is what matters.

### Step 2 — Create the dashboard comparison API endpoint

Create `dashboard/app/api/dashboard/comparison/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query } from "@/lib/postgres";
import { 
  getExperimentDailyLift, 
  getExperimentFunnel 
} from "@/lib/timeseries";
import { computeExperimentResults } from "@/lib/experiment-results";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

interface ExperimentComparisonItem {
  id: string;
  slug: string;
  name: string;
  status: string;
  lift: number | null;
  p_value: number | null;
  msprt_p_value: number | null;
  cuped_variance_reduction: number | null;
  srm_flag: any;
  n_total: number;
  daily_lift: any[];
  funnel: any[];
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // Get all running experiments
  const experiments = await query<{ id: string; slug: string; name: string; status: string; primary_metric: string }>(
    `SELECT id, slug, name, status, primary_metric 
     FROM experiments 
     WHERE customer_id = $1 AND status = 'running'
     ORDER BY created_at ASC`,
    [customer.id]
  );

  // For each experiment, fetch results + daily lift + funnel in parallel
  const items: ExperimentComparisonItem[] = await Promise.all(
    experiments.map(async (exp) => {
      try {
        const [results, dailyLift, funnel] = await Promise.all([
          computeExperimentResults(exp.id, customer.id),
          getExperimentDailyLift(exp.slug, exp.primary_metric),
          getExperimentFunnel(exp.slug, exp.primary_metric),
        ]);

        // Average CUPED variance reduction across variants
        const controlVR = results?.variants?.find((v: any) => v.name === "control")?.variance_reduction_pct;
        const treatmentVR = results?.variants?.find((v: any) => v.name === "treatment")?.variance_reduction_pct;
        let cupedVR: number | null = null;
        if (controlVR != null && treatmentVR != null) cupedVR = (controlVR + treatmentVR) / 2;
        else if (controlVR != null) cupedVR = controlVR;
        else if (treatmentVR != null) cupedVR = treatmentVR;

        return {
          id: exp.id,
          slug: exp.slug,
          name: exp.name,
          status: exp.status,
          lift: results?.lift ?? null,
          p_value: results?.p_value ?? null,
          msprt_p_value: results?.msprt_p_value ?? null,
          cuped_variance_reduction: cupedVR,
          srm_flag: results?.srm_flag ?? null,
          n_total: results?.variants?.reduce((s: number, v: any) => s + (v.n || 0), 0) || 0,
          daily_lift: dailyLift,
          funnel,
        };
      } catch (err) {
        console.warn(`Failed to load comparison data for ${exp.id}:`, err);
        return {
          id: exp.id,
          slug: exp.slug,
          name: exp.name,
          status: exp.status,
          lift: null,
          p_value: null,
          msprt_p_value: null,
          cuped_variance_reduction: null,
          srm_flag: null,
          n_total: 0,
          daily_lift: [],
          funnel: [],
        };
      }
    })
  );

  return corsResponse({ experiments: items });
}
```

### Step 3 — Create the ExperimentColumn component

Create `dashboard/components/dashboard/ExperimentColumn.tsx`:

```tsx
"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { LiftTrendChart } from "@/components/charts/LiftTrendChart";
import { ConversionRateChart } from "@/components/charts/ConversionRateChart";
import { ConversionFunnel } from "@/components/charts/ConversionFunnel";

interface Props {
  experiment: {
    id: string;
    name: string;
    status: string;
    lift: number | null;
    p_value: number | null;
    msprt_p_value: number | null;
    cuped_variance_reduction: number | null;
    srm_flag: any;
    n_total: number;
    daily_lift: any[];
    funnel: any[];
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function ExperimentColumn({ experiment }: Props) {
  const exp = experiment;
  const liftColor = exp.lift == null ? "text-[#727785]" : exp.lift > 0 ? "text-emerald-600" : exp.lift < 0 ? "text-red-600" : "text-[#727785]";

  return (
    <Link
      href={`/experiments/${exp.id}`}
      className="block bg-white border border-[#c2c6d6] rounded-xl overflow-hidden hover:border-[#0058be]/50 hover:shadow-md transition-all"
    >
      {/* Header */}
      <div className="p-5 border-b border-[#c2c6d6]/40">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-[#0b1c30]">{exp.name}</h3>
          <ArrowRight size={14} className="text-[#727785]" />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#0058be] text-[10px] font-bold uppercase tracking-wider">
            {exp.status}
          </span>
          {exp.srm_flag && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider">
              <AlertTriangle size={10} />
              SRM
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${liftColor}`}>
            {exp.lift == null ? "—" : `${exp.lift > 0 ? "+" : ""}${(exp.lift * 100).toFixed(1)}%`}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#727785]">Lift</span>
        </div>
        <p className="text-xs text-[#727785] tabular-nums mt-1">
          {formatNumber(exp.n_total)} users assigned
        </p>
      </div>

      {/* Lift Trend chart */}
      <div className="p-4 border-b border-[#c2c6d6]/40">
        <p className="text-[10px] uppercase tracking-wider text-[#727785] font-semibold mb-2">Lift Trend</p>
        <LiftTrendChart data={exp.daily_lift} compact />
      </div>

      {/* Conversion Rate chart */}
      <div className="p-4 border-b border-[#c2c6d6]/40">
        <p className="text-[10px] uppercase tracking-wider text-[#727785] font-semibold mb-2">Conversion Rate</p>
        <ConversionRateChart data={exp.daily_lift} compact />
      </div>

      {/* Funnel chart */}
      <div className="p-4 border-b border-[#c2c6d6]/40">
        <p className="text-[10px] uppercase tracking-wider text-[#727785] font-semibold mb-2">Funnel</p>
        <ConversionFunnel data={exp.funnel} compact />
      </div>

      {/* Stats row */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#727785]">Classical p</p>
          <p className="text-sm font-mono tabular-nums text-[#0b1c30]">
            {exp.p_value != null ? exp.p_value.toFixed(4) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#727785]">Always-valid p</p>
          <p className="text-sm font-mono tabular-nums text-[#0b1c30]">
            {exp.msprt_p_value != null ? exp.msprt_p_value.toFixed(4) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#727785]">CUPED</p>
          <p className="text-sm font-mono tabular-nums text-[#0b1c30]">
            {exp.cuped_variance_reduction != null 
              ? `${exp.cuped_variance_reduction.toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

### Step 4 — Create the ComparisonGrid wrapper

Create `dashboard/components/dashboard/ComparisonGrid.tsx`:

```tsx
"use client";

import { ExperimentColumn } from "./ExperimentColumn";

interface ExperimentItem {
  id: string;
  name: string;
  status: string;
  lift: number | null;
  p_value: number | null;
  msprt_p_value: number | null;
  cuped_variance_reduction: number | null;
  srm_flag: any;
  n_total: number;
  daily_lift: any[];
  funnel: any[];
}

interface Props {
  experiments: ExperimentItem[];
  loading?: boolean;
}

export function ComparisonGrid({ experiments, loading = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div 
            key={i} 
            className="bg-white border border-[#c2c6d6] rounded-xl h-[640px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!experiments || experiments.length === 0) {
    return (
      <div className="bg-white border border-[#c2c6d6] rounded-xl p-8 text-center text-[#727785]">
        No active experiments. <a href="/experiments" className="text-[#0058be] hover:underline">View all experiments</a>.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {experiments.map((exp) => (
        <ExperimentColumn key={exp.id} experiment={exp} />
      ))}
    </div>
  );
}
```

### Step 5 — Update the Dashboard page

In `dashboard/app/(dashboard)/dashboard/page.tsx`:

**Add the comparison data fetching** (server-side, since the page is a server component):

```tsx
async function fetchComparisonData() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const res = await fetch(`${protocol}://${host}/api/dashboard/comparison`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function DashboardPage() {
  const [data, timeseries, comparison] = await Promise.all([
    fetchDashboardData(), 
    fetchTimeseries(),
    fetchComparisonData(),
  ]);
  // ...
}
```

**Restructure the page body** to use the new layout:

```tsx
import { ComparisonGrid } from "@/components/dashboard/ComparisonGrid";

// Inside the return:
return (
  <div className="max-w-7xl mx-auto">
    {/* Header */}
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-[#0b1c30] mb-2">Dashboard</h1>
      <p className="text-[#424754]">
        Workspace overview — your experiments, data, and insights at a glance.
      </p>
    </div>

    {/* KPI cards (existing, unchanged) */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* ... existing 4 KPI cards ... */}
    </div>

    {/* Events over time chart (existing, unchanged) */}
    <div className="mb-8">
      {/* ... existing EventsOverTimeChart ... */}
    </div>

    {/* NEW: Experiment Comparison Grid */}
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#0b1c30]">Active Experiments Comparison</h2>
          <p className="text-xs text-[#727785]">Side-by-side view of all running experiments · click any column for full detail</p>
        </div>
        <Link 
          href="/experiments" 
          className="text-sm text-[#0058be] hover:underline flex items-center gap-1"
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>
      <ComparisonGrid experiments={comparison?.experiments || []} />
    </div>

    {/* Recent Activity (moved BELOW the grid, full width) */}
    <div className="mb-8">
      <h2 className="text-lg font-bold text-[#0b1c30] mb-4">Recent Activity</h2>
      <div className="bg-white border border-[#c2c6d6] rounded-xl divide-y divide-[#c2c6d6]/50">
        {activity.length === 0 && (
          <div className="p-5 text-sm text-[#727785]">No recent activity.</div>
        )}
        {activity.map((item: any, i: number) => {
          const Icon = item.type === "readout" ? Sparkles : Database;
          return (
            <div key={i} className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 rounded-md bg-[#eff4ff]">
                  <Icon size={14} className="text-[#0058be]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0b1c30]">{item.title}</p>
                  <p className="text-xs text-[#727785]">{item.subtitle}</p>
                  <p className="text-[10px] text-[#727785] mt-1 uppercase tracking-wider">
                    {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
```

The previous 2-column layout (active experiments left + activity right) is replaced entirely. The comparison grid is full width, the activity feed sits below it full width.

### Step 6 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface ExperimentComparisonItem {
  id: string;
  slug: string;
  name: string;
  status: string;
  lift: number | null;
  p_value: number | null;
  msprt_p_value: number | null;
  cuped_variance_reduction: number | null;
  srm_flag: any;
  n_total: number;
  daily_lift: any[];
  funnel: any[];
}

export interface ExperimentComparisonResponse {
  experiments: ExperimentComparisonItem[];
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ Visiting `/dashboard` shows the new 3-column experiment comparison grid
3. ✅ Each column shows: name + status + lift number (big) + Lift Trend + Conversion Rate + Funnel + Classical/mSPRT/CUPED stats row
4. ✅ The SRM badge appears on the Nav Layout Test column
5. ✅ Each column is a clickable link to the experiment detail page (hover state visible)
6. ✅ All chart data is REAL — no hardcoded values, every chart pulls from raw_events/raw_assignments via the existing timeseries functions
7. ✅ The compact mode charts render at ~140-180px height, not the full 260-300px of the detail page
8. ✅ The Recent Activity feed sits below the grid at full width (not in a sidebar column anymore)
9. ✅ KPI cards row and Event Volume chart at the top remain unchanged
10. ✅ Layout works on a typical desktop viewport (≥1280px); columns collapse to stacked on mobile (md: breakpoint)
11. ✅ If an experiment has no data (empty funnel, no daily lift), the column renders gracefully with "—" or "No data" placeholders instead of crashing

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/dashboard` showing the new 3-column comparison grid in full
3. Confirm the Nav Layout Test column shows the SRM badge prominently
4. Confirm the Hero CTA Test column shows a meaningful Lift Trend trajectory (it has the highest lift)
5. Confirm clicking any column navigates to that experiment's detail page

If anything fails, stop and tell me.

---

## 5. Notes on potential issues

**Funnel chart in compact mode**: Recharts FunnelChart label positioning can be tricky at small sizes. If the labels overlap or look cramped in compact mode, it's acceptable to:
- Reduce label font to 9px
- Show only the value (not the name) inside the trapezoid
- Drop the LabelList for the name in compact mode

**3 columns on narrow screens**: The `md:grid-cols-3` collapse to single column below 768px viewport. Acceptable for demo (which records on desktop). No further responsive work needed.

**Performance**: The comparison endpoint runs N parallel queries (one per experiment) × 3 functions each. At 3 experiments × ~600ms per `getExperimentDailyLift` call, total response is ~600-800ms. Acceptable. If it grows slower than 2s, consider caching the response server-side for 60 seconds.

---

Begin. Execute Steps 1 → 6 in order. Verify each step before moving on.
