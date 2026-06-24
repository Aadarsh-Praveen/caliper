# Caliper Phase 5.5 — Dashboard Polish (KPI Sparklines + Chart Placement)

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

Phase 5.4 added charts across multiple pages. The Dashboard now has an EventsOverTimeChart and the Active Experiments cards have lift sparklines.

This phase makes two small but high-impact additions to the Dashboard specifically:

1. **Add mini sparklines to each of the 4 KPI cards** showing the trend of that KPI over the last 7 days
2. **Verify the EventsOverTimeChart is placed prominently** between the KPI cards and the Active Experiments / Activity Feed section, with proper visual weight

The goal is to add visual density without restructuring the Dashboard. The current information hierarchy (KPIs → chart → experiments/activity) is preserved. The layout becomes more scannable and feels more like a "real product dashboard."

## 1. Files to modify or create

```
dashboard/app/api/dashboard/timeseries/route.ts   ← EXTEND to return KPI sparkline data
dashboard/lib/timeseries.ts                        ← EXTEND with getKpiTimeseries() function
dashboard/components/charts/KpiSparkline.tsx       ← CREATE small inline sparkline
dashboard/app/(dashboard)/dashboard/page.tsx       ← MODIFY to render sparklines on KPI cards
dashboard/lib/types.ts                             ← ADD KpiSparklineData type
```

## 2. Step-by-step

### Step 1 — Extend the timeseries module with KPI series

In `dashboard/lib/timeseries.ts`, add the following function. This produces 7 days of values for each of the 4 KPIs shown on the Dashboard:

- Active experiments per day (count of experiments with status 'running' that existed on that day)
- Total events per day
- Total users assigned per day
- Average CUPED variance reduction per day (across all experiments)

```typescript
export interface KpiDailyPoint {
  day: string;
  value: number;
}

export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
}

/**
 * Compute daily time series for each of the 4 dashboard KPIs over the last 7 days.
 * Values are CUMULATIVE — i.e. "as of end of day X", how many events/users existed in total.
 * This matches how the headline KPI numbers are computed.
 */
export async function getKpiTimeseries(customerId: string): Promise<KpiSparklineSeries> {
  // Build the 7-day series. For cumulative metrics we count everything <= each day.
  
  // Active experiments per day — running OR started before that day
  // Simpler: just count experiments with status='running' for each day (since we don't track historical status,
  // we approximate by counting experiments created <= day AND not stopped before day)
  const activeRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT 
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(e.id)::int as count
     FROM days d
     LEFT JOIN experiments e 
       ON e.customer_id = $1
       AND e.created_at::date <= d.day
       AND (e.status = 'running' OR e.created_at::date <= d.day)
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [customerId]
  );

  // Events per day — cumulative count of events with ts <= end of day
  const eventsRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT 
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(e.event_id)::int as count
     FROM days d
     LEFT JOIN raw_events e ON e.ts::date <= d.day
     GROUP BY d.day
     ORDER BY d.day ASC`
  );

  // Users assigned per day — cumulative distinct users with assigned_at <= end of day
  const usersRows = await query<{ day: string; count: number }>(
    `WITH days AS (
       SELECT generate_series(
         (NOW() - INTERVAL '6 days')::date,
         NOW()::date,
         '1 day'::interval
       )::date as day
     )
     SELECT 
       TO_CHAR(d.day, 'YYYY-MM-DD') as day,
       COUNT(DISTINCT a.user_id)::int as count
     FROM days d
     LEFT JOIN raw_assignments a ON a.assigned_at::date <= d.day
     GROUP BY d.day
     ORDER BY d.day ASC`
  );

  // CUPED variance reduction is computed live each time the aggregator runs,
  // not stored historically. For the sparkline, we'll generate a flat series 
  // using the current value from the most recent STATS items.
  // This is HONEST: we genuinely don't have historical CUPED snapshots.
  // Show flat line at current value across all 7 days.
  // If we eventually add historical CUPED tracking, this swaps in.
  const cupedSeries: KpiDailyPoint[] = [];
  const days = activeRows.map((r) => r.day);
  
  // Get current avg CUPED from running experiments by computing fresh
  const experiments = await query<{ id: string; slug: string }>(
    `SELECT id, slug FROM experiments WHERE customer_id = $1 AND status = 'running'`,
    [customerId]
  );
  
  let cupedSum = 0;
  let cupedCount = 0;
  for (const exp of experiments) {
    try {
      const { computeExperimentResults } = await import("./experiment-results");
      const results = await computeExperimentResults(exp.id, customerId);
      if (!results) continue;
      const controlVR = results.variants?.find((v: any) => v.name === "control")?.variance_reduction_pct;
      const treatmentVR = results.variants?.find((v: any) => v.name === "treatment")?.variance_reduction_pct;
      let expVR: number | null = null;
      if (controlVR != null && treatmentVR != null) expVR = (controlVR + treatmentVR) / 2;
      else if (controlVR != null) expVR = controlVR;
      else if (treatmentVR != null) expVR = treatmentVR;
      if (expVR != null) {
        cupedSum += expVR;
        cupedCount += 1;
      }
    } catch (err) {
      console.warn(`Failed CUPED lookup for ${exp.id}:`, err);
    }
  }
  
  const currentCuped = cupedCount > 0 ? cupedSum / cupedCount : 0;
  for (const day of days) {
    cupedSeries.push({ day, value: currentCuped });
  }

  return {
    active_experiments: activeRows.map((r) => ({ day: r.day, value: r.count })),
    total_events: eventsRows.map((r) => ({ day: r.day, value: r.count })),
    total_users: usersRows.map((r) => ({ day: r.day, value: r.count })),
    avg_cuped_variance_reduction: cupedSeries,
  };
}
```

### Step 2 — Extend the Dashboard timeseries API to return KPI sparklines

In `dashboard/app/api/dashboard/timeseries/route.ts`, update the GET handler to also call `getKpiTimeseries()` and include it in the response:

```typescript
import { 
  getDailyMetricVolume, 
  getExperimentDailyLift,
  getKpiTimeseries,   // ADD
} from "@/lib/timeseries";

// ...

export async function GET(req: NextRequest) {
  // ... existing auth code ...

  const [dailyVolume, kpiSeries] = await Promise.all([
    getDailyMetricVolume(),
    getKpiTimeseries(customer.id),
  ]);

  // ... existing experiments+sparklines code ...

  return corsResponse({
    daily_volume: dailyVolume,
    sparklines,             // existing
    kpi_sparklines: kpiSeries,  // NEW
  });
}
```

### Step 3 — Create the KpiSparkline component

Create `dashboard/components/charts/KpiSparkline.tsx`:

```tsx
"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface KpiPoint {
  day: string;
  value: number;
}

interface Props {
  data: KpiPoint[];
  color?: string;
  height?: number;
}

export function KpiSparkline({ data, color = "#0058be", height = 36 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div 
        style={{ height }} 
        className="flex items-center text-[10px] text-[#c2c6d6]"
      >
        —
      </div>
    );
  }

  // Determine if the series is meaningful — if all values are identical, render a flat reference line
  const allSame = data.every((d) => d.value === data[0].value);
  const sparklineColor = allSame ? "#c2c6d6" : color;

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={sparklineColor}
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

### Step 4 — Update the Dashboard page to render KPI sparklines

In `dashboard/app/(dashboard)/dashboard/page.tsx`:

**Add the import:**
```tsx
import { KpiSparkline } from "@/components/charts/KpiSparkline";
```

**Update each of the 4 KPI cards** to include a sparkline below the value. Current structure of each card:

```tsx
<div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Active</p>
    <FlaskConical size={16} className="text-[#0058be]" />
  </div>
  <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">{kpis.active_experiments}</p>
  <p className="text-xs text-[#727785] mt-1">Experiments running</p>
</div>
```

**Becomes:**

```tsx
<div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Active</p>
    <FlaskConical size={16} className="text-[#0058be]" />
  </div>
  <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">{kpis.active_experiments}</p>
  <p className="text-xs text-[#727785] mt-1 mb-3">Experiments running</p>
  {timeseries?.kpi_sparklines?.active_experiments && (
    <KpiSparkline 
      data={timeseries.kpi_sparklines.active_experiments} 
      color="#0058be"
      height={32}
    />
  )}
</div>
```

**Repeat for all four cards** using the matching keys from the API response:

| Card | sparkline key | color |
|---|---|---|
| Active | `kpi_sparklines.active_experiments` | `#0058be` |
| Events | `kpi_sparklines.total_events` | `#0058be` |
| Users | `kpi_sparklines.total_users` | `#0058be` |
| CUPED | `kpi_sparklines.avg_cuped_variance_reduction` | `#0058be` |

Keep all sparklines the same color (`#0058be`) for visual consistency. The data shape and trend variation will provide the visual differentiation.

### Step 5 — Verify EventsOverTimeChart placement

The Phase 5.4 spec already placed `EventsOverTimeChart` on the Dashboard. Verify it's between the KPI cards and the Active Experiments / Activity Feed sections. If it's anywhere else, move it.

The correct rendering order on the Dashboard:

```
1. Header (Dashboard / Workspace overview)
2. KPI cards (4 cards in a row, now WITH sparklines)
3. Event Volume chart (full width, ~280px tall)
4. Two-column layout: Active Experiments (left) + Recent Activity (right)
```

The chart section should look like:

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

### Step 6 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface KpiDailyPoint {
  day: string;
  value: number;
}

export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
}

// Extend the existing DashboardTimeseries type if it exists, or define:
export interface DashboardTimeseries {
  daily_volume: Array<{ day: string; event_name: string; count: number }>;
  sparklines: Record<string, Array<{ day: string; lift_pct: number }>>;
  kpi_sparklines: KpiSparklineSeries;
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ Visiting `/dashboard` shows all four KPI cards now with a thin sparkline below the description
3. ✅ The "Events" KPI sparkline shows an upward trend (cumulative count rising over 7 days)
4. ✅ The "Users" KPI sparkline shows an upward trend
5. ✅ The "Active" KPI sparkline is either flat (if all 3 experiments have existed for all 7 days) or rises
6. ✅ The "CUPED" KPI sparkline is flat (gray color, since we don't track historical CUPED) — this is intentional, not a bug
7. ✅ The EventsOverTimeChart still appears between KPI cards and Active Experiments section
8. ✅ Visual hierarchy is preserved: 15-second-scan story still reads clearly
9. ✅ No other pages have been changed unintentionally

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/dashboard` showing the 4 KPI cards with sparklines + the Event Volume chart below

If anything fails, stop and tell me.

---

## 5. Notes for the implementer

**About the flat CUPED sparkline**: This is honest. We genuinely don't track historical CUPED variance reduction snapshots — it's recomputed each time the aggregator runs. Showing a flat line at the current value is the truthful display. The gray color (set automatically when all values are identical) signals to the viewer that this isn't a real trend, it's a constant.

**About cumulative vs incremental sparklines**: All sparklines show CUMULATIVE values (total events ever, total users ever, etc.). This matches the KPI numbers themselves, which are also cumulative totals. If we showed daily-incremental values, the sparkline would look noisy and disagree with the headline number. Cumulative is the right choice.

**About performance**: The KPI timeseries function runs 3 cumulative SQL queries + iterates over experiments to compute CUPED. At your data volume (~30K events, ~10K assignments, 3 experiments) this should complete in <1 second. If it's slower, consider caching the response server-side for 60 seconds.

---

Begin. Execute Steps 1 → 6 in order.
