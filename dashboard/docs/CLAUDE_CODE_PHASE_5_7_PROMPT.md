# Caliper Phase 5.7 — Replace Empty KPI Cards with Real Metrics

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

The Dashboard currently has 4 KPI cards. Two of them are showing empty/placeholder content:

| Card | Current State | Issue |
|---|---|---|
| Win Rate | "—" / "No data" | Win rate isn't a concept Caliper tracks |
| Est. Impact | "—" / "Revenue not configured" | No revenue model exists in the system |

These cards make the Dashboard look broken/incomplete. We're replacing both with KPIs that pull from real data we already have.

**New cards:**

| Replacing | New KPI | Real Data Source | Visual Signal |
|---|---|---|---|
| Win Rate | **SRM Alerts** | Count of experiments where SRM is detected | Red indicator if > 0 |
| Est. Impact | **Readouts Generated** | Count from `readouts` table | Blue/neutral |

Both metrics are small in absolute terms (likely 1 and 3 currently) but tell true stories about Caliper's distinct capabilities — SRM detection and AI readouts.

## 1. Files to modify

```
dashboard/app/api/dashboard/route.ts                 ← UPDATE KPI computation + add new fields
dashboard/lib/timeseries.ts                          ← UPDATE getKpiTimeseries() to include new series
dashboard/app/api/dashboard/timeseries/route.ts      ← (Already calls getKpiTimeseries, no changes needed)
dashboard/app/(dashboard)/dashboard/page.tsx         ← REPLACE the two KPI cards
dashboard/lib/types.ts                               ← UPDATE DashboardKPIs + KpiSparklineSeries
```

## 2. Step-by-step

### Step 1 — Update the Dashboard API to return new KPI values

In `dashboard/app/api/dashboard/route.ts`, the current KPI computation returns these fields:

```typescript
kpis: {
  active_experiments: number;
  total_events: number;
  total_users: number;
  avg_cuped_variance_reduction: number | null;
}
```

**Add two more fields**: `srm_alerts` and `readouts_generated`.

**For SRM alerts**: count experiments where `srm_flag` is non-null in the latest results. We need to query DynamoDB or compute fresh. The cleanest approach: iterate over each running experiment, call `computeExperimentResults`, and check whether `results.srm_flag` is truthy.

Actually we're already iterating over experiments to compute CUPED VR in the existing code. Extend that loop to also count SRMs.

**For readouts generated**: simple count from Aurora.

Modify the GET handler:

```typescript
// Inside GET, after the existing variable declarations:

// Count readouts generated (across all experiments for this customer)
const readoutsRow = await queryOne<{ count: string }>(
  `SELECT COUNT(*)::text as count 
   FROM readouts r
   JOIN experiments e ON r.experiment_id = e.id
   WHERE e.customer_id = $1`,
  [customer.id]
);
const readoutsGenerated = parseInt(readoutsRow?.count || "0", 10);

// Count SRM alerts across running experiments
// We already iterate over experiments below for CUPED; extend that loop.
let srmAlerts = 0;

// In the existing experiment loop, where we compute CUPED:
for (const exp of experiments) {
  try {
    const { computeExperimentResults } = await import("@/lib/experiment-results");
    const results = await computeExperimentResults(exp.id, customer.id);
    if (!results) continue;
    
    // ...existing CUPED computation...
    
    // NEW: count SRM if flag is truthy
    if (results.srm_flag) {
      srmAlerts += 1;
    }
    
    // ...rest of existing loop...
  } catch (err) {
    console.warn(`Failed to load results for ${exp.id}:`, err);
  }
}

// In the return statement, update the kpis object:
return corsResponse({
  kpis: {
    active_experiments: activeCount,
    total_events: totalEvents,
    total_users: totalUsers,
    avg_cuped_variance_reduction: avgCupedVR,
    srm_alerts: srmAlerts,             // NEW
    readouts_generated: readoutsGenerated, // NEW
  },
  experiments: experimentSummaries,
  activity: activity.slice(0, 8),
});
```

### Step 2 — Update the KPI timeseries function to include new series

In `dashboard/lib/timeseries.ts`, the `getKpiTimeseries()` function currently returns sparkline data for 4 KPIs. Add 2 more series.

**Update the `KpiSparklineSeries` interface:**

```typescript
export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
  srm_alerts: KpiDailyPoint[];          // NEW
  readouts_generated: KpiDailyPoint[];  // NEW
}
```

**In `getKpiTimeseries(customerId)`, add two new queries:**

```typescript
// Readouts generated per day (cumulative, like other KPIs)
const readoutsRows = await query<{ day: string; count: number }>(
  `WITH days AS (
     SELECT generate_series(
       (NOW() - INTERVAL '6 days')::date,
       NOW()::date,
       '1 day'::interval
     )::date as day
   )
   SELECT 
     TO_CHAR(d.day, 'YYYY-MM-DD') as day,
     COUNT(r.id)::int as count
   FROM days d
   LEFT JOIN readouts r ON r.generated_at::date <= d.day
   LEFT JOIN experiments e ON e.id = r.experiment_id AND e.customer_id = $1
   WHERE e.customer_id IS NOT NULL OR r.id IS NULL
   GROUP BY d.day
   ORDER BY d.day ASC`,
  [customerId]
);

// SRM alerts: this is tricky because we don't have a "srm detected at" timestamp 
// stored historically. We have current SRM state (from DynamoDB items), but the 
// sparkline needs a 7-day series.
// HONEST APPROACH: For now, generate a flat sparkline at the current SRM count
// (similar pattern to CUPED).
// In production we'd store SRM detection events with timestamps; for the demo, 
// flat-line at current value is the truthful display.

const srmFlatValue = await (async () => {
  // Count current SRM alerts by checking each running experiment
  const exps = await query<{ id: string; slug: string }>(
    `SELECT id, slug FROM experiments WHERE customer_id = $1 AND status = 'running'`,
    [customerId]
  );
  let count = 0;
  for (const exp of exps) {
    try {
      const { computeExperimentResults } = await import("./experiment-results");
      const results = await computeExperimentResults(exp.id, customerId);
      if (results?.srm_flag) count += 1;
    } catch (err) {
      // skip
    }
  }
  return count;
})();

const srmSeries: KpiDailyPoint[] = activeRows.map((r) => ({ 
  day: r.day, 
  value: srmFlatValue 
}));

// Add to return:
return {
  active_experiments: activeRows.map((r) => ({ day: r.day, value: r.count })),
  total_events: eventsRows.map((r) => ({ day: r.day, value: r.count })),
  total_users: usersRows.map((r) => ({ day: r.day, value: r.count })),
  avg_cuped_variance_reduction: cupedSeries,
  srm_alerts: srmSeries,                                                   // NEW
  readouts_generated: readoutsRows.map((r) => ({ day: r.day, value: r.count })), // NEW
};
```

### Step 3 — Update the Dashboard page to render new KPI cards

In `dashboard/app/(dashboard)/dashboard/page.tsx`:

**Add icon imports:**
```tsx
import { 
  // ... existing imports ...
  AlertTriangle,   // for SRM Alerts
  // Sparkles is already imported for the activity feed; reuse it for Readouts
} from "lucide-react";
```

**Find the two existing cards** for "Win Rate" and "Est. Impact" (they're the 3rd and 4th cards in the KPI grid).

**Replace the "Win Rate" card** with:

```tsx
<div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">
      SRM Alerts
    </p>
    <AlertTriangle 
      size={16} 
      className={kpis.srm_alerts > 0 ? "text-red-600" : "text-[#727785]"} 
    />
  </div>
  <p className={`text-3xl font-bold tabular-nums ${
    kpis.srm_alerts > 0 ? "text-red-600" : "text-[#0b1c30]"
  }`}>
    {kpis.srm_alerts}
  </p>
  <p className="text-xs text-[#727785] mt-1 mb-3">
    {kpis.srm_alerts === 0 
      ? "All randomization healthy" 
      : `${kpis.srm_alerts === 1 ? "Experiment" : "Experiments"} flagged`}
  </p>
  {timeseries?.kpi_sparklines?.srm_alerts && (
    <KpiSparkline 
      data={timeseries.kpi_sparklines.srm_alerts} 
      color={kpis.srm_alerts > 0 ? "#dc2626" : "#0058be"}
      height={32}
    />
  )}
</div>
```

**Replace the "Est. Impact" card** with:

```tsx
<div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">
      AI Readouts
    </p>
    <Sparkles size={16} className="text-[#0058be]" />
  </div>
  <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">
    {kpis.readouts_generated}
  </p>
  <p className="text-xs text-[#727785] mt-1 mb-3">
    Generated by Bedrock
  </p>
  {timeseries?.kpi_sparklines?.readouts_generated && (
    <KpiSparkline 
      data={timeseries.kpi_sparklines.readouts_generated} 
      color="#0058be"
      height={32}
    />
  )}
</div>
```

The full 4-card row now reads: **Active · Events · Users · CUPED · SRM Alerts · AI Readouts** — wait, that's 6 cards. We have 4 slots. Let me clarify the layout:

The grid is `grid-cols-1 md:grid-cols-4`. We have 4 slots. The current 4 cards are: Active, Events, Users, CUPED (in some order, plus Win Rate and Est. Impact making 6 originally).

Looking at the screenshot, the current 4 cards are: **Active, Events, Users, CUPED**. The other two (Win Rate, Est. Impact) don't exist yet in the layout — they're from the v0 mock design.

**Reread the page code carefully.** If the page currently only has 4 cards (Active, Events, Users, CUPED) and no Win Rate / Est. Impact cards, then the user is asking about cards that haven't been built yet. In that case:

**Either**:
(a) The user has 6 cards in their current layout and we need to replace 2 of them, OR
(b) The user has 4 cards in their current layout and is asking what to put in 2 *future* cards if we were to expand to 6

Check the current `dashboard/app/(dashboard)/dashboard/page.tsx` file:
- If you see Win Rate and Est. Impact cards → replace them as described above
- If you only see 4 cards (no Win Rate / Est. Impact) → the user wants us to ADD 2 more cards, expanding from `md:grid-cols-4` to `md:grid-cols-6` or `md:grid-cols-3` with 2 rows of 3

**Adapt accordingly**:
- If 6 cards exist: replace the 2 dead ones with SRM Alerts and AI Readouts
- If 4 cards exist: add 2 more cards (SRM Alerts and AI Readouts) and change grid to `md:grid-cols-6` (or `md:grid-cols-3` with 2 rows). 6 cards at full width gets narrow per card — `md:grid-cols-3` with `gap-4` and 2 rows is the more readable layout for 6 cards.

For 6 cards in a 3×2 layout:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
  {/* Active */}
  {/* Events */}
  {/* Users */}
  {/* CUPED */}
  {/* SRM Alerts */}
  {/* AI Readouts */}
</div>
```

Each card stays at full p-6 padding. Reads cleanly.

### Step 4 — Add TypeScript types

In `dashboard/lib/types.ts`:

```typescript
export interface DashboardKPIs {
  active_experiments: number;
  total_events: number;
  total_users: number;
  avg_cuped_variance_reduction: number | null;
  srm_alerts: number;                  // NEW
  readouts_generated: number;          // NEW
}

export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
  srm_alerts: KpiDailyPoint[];          // NEW
  readouts_generated: KpiDailyPoint[];  // NEW
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ The Dashboard now shows 6 KPI cards in a 3-column × 2-row grid (or replaces 2 existing cards if Win Rate / Est. Impact were already present)
3. ✅ "SRM Alerts" card shows the actual count of running experiments with srm_flag set (likely 1 — Nav Layout Test)
4. ✅ When SRM Alerts > 0, the card's icon and big number are red (color: text-red-600)
5. ✅ When SRM Alerts == 0, the card defaults to neutral colors
6. ✅ "AI Readouts" card shows the actual count from the readouts table (likely 3+ from prior testing)
7. ✅ Both new cards have working sparklines below
8. ✅ AI Readouts sparkline shows a rising line (cumulative readout count growing over 7 days)
9. ✅ SRM Alerts sparkline is flat (since we don't track historical SRM detection events, this is intentional)

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/dashboard` showing all 6 KPI cards including the new SRM Alerts (red indicator) and AI Readouts cards
3. Confirm the SRM Alerts number matches the count of experiments currently showing the red SRM badge in the comparison grid below

If anything fails, stop and tell me.

---

## 5. Notes for the implementer

**About the flat SRM sparkline**: We don't store historical SRM detection timestamps. The sparkline is intentionally flat at the current value, matching the same pattern as the CUPED sparkline. This is honest — we're not faking trend data.

**About "AI Readouts" naming**: This card label is intentionally short ("AI Readouts" not "Readouts Generated by Bedrock"). The icon (Sparkles) plus the subtitle "Generated by Bedrock" carry the rest of the meaning. Keep card titles concise — 1-3 words max.

**About icon color when SRM = 0**: When all experiments are healthy, the AlertTriangle icon should still appear but in neutral gray (`text-[#727785]`), not green. Green would imply "this is good" but the SRM icon is fundamentally a warning shape — gray reads as "no alerts" cleanly.

---

Begin. Execute Steps 1 → 4 in order.
