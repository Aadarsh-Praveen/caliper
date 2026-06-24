# Caliper Phase 5.1 — Dashboard Landing Page + Sidebar Nav Fix

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context — what's broken and what we're building

### The bug
The sidebar nav's "Dashboard" link in `dashboard/app/(dashboard)/layout.tsx` currently has `href: "/"` which points at the **marketing landing page** (`app/page.tsx`). Clicking Dashboard from anywhere in the app sends users to the marketing page — wrong behavior.

Also, the active-state check `href !== "/"` explicitly excludes Dashboard from being highlighted as active. That workaround needs to go.

### The new feature
A real Dashboard page at the URL `/dashboard` that serves as the app's landing page when entering from the marketing site. Shows workspace-level summary information:
- 4 KPI cards (active experiments, total events, users assigned, avg CUPED variance reduction)
- Recent activity feed pulling from real data sources (readouts, SRM detections, dbt runs)
- A compact list of currently running experiments with links to detail pages

### Navigation flow after fix
```
/ (marketing landing)
  ↓ click "Dashboard →" button OR "Try the demo →" 
/dashboard (NEW - workspace overview)
  ↓ sidebar: click "Experiments" OR click an experiment in the active widget
/experiments (list)
  ↓ click any experiment card
/experiments/[id] (detail)
```

The sidebar persists across all `(dashboard)` route group pages.

## 1. Files to modify

```
dashboard/app/(dashboard)/layout.tsx           ← FIX nav hrefs + active state
dashboard/app/(dashboard)/dashboard/page.tsx   ← CREATE the new Dashboard page
dashboard/app/api/dashboard/route.ts           ← CREATE API endpoint
dashboard/app/page.tsx                         ← UPDATE Dashboard→ button href
dashboard/lib/types.ts                         ← ADD DashboardData type
```

## 2. Step-by-step

### Step 1 — Fix the sidebar nav

In `dashboard/app/(dashboard)/layout.tsx`:

**Change the NAV array** to:

```typescript
const NAV = [
  { label: "Dashboard",   href: "/dashboard",   icon: LayoutGrid   },
  { label: "Experiments", href: "/experiments", icon: FlaskConical },
  { label: "Metrics",     href: "/metrics",     icon: BarChart2, disabled: true },
  { label: "Settings",    href: "/settings",    icon: Settings,  disabled: true },
];
```

**Change the active-state line** from:
```typescript
const active = href !== "/" && href !== "#" && pathname.startsWith(href);
```
to:
```typescript
const active = pathname === href || pathname.startsWith(href + "/");
```

**Add disabled-state handling** to the Link component:

```tsx
{NAV.map(({ label, href, icon: Icon, disabled }) => {
  const active = pathname === href || pathname.startsWith(href + "/");
  if (disabled) {
    return (
      <div
        key={label}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#c2c6d6] cursor-not-allowed"
        title="Coming soon"
      >
        <Icon size={20} strokeWidth={1.5} />
        {label}
        <span className="ml-auto text-[10px] uppercase tracking-wider">soon</span>
      </div>
    );
  }
  return (
    <Link
      key={label}
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
        active
          ? "bg-[#0058be]/[0.08] text-[#0058be] font-semibold"
          : "text-[#424754] hover:bg-[#eff4ff] hover:text-[#0058be]"
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.5} />
      {label}
    </Link>
  );
})}
```

The "soon" badge on Metrics/Settings is honest and looks intentional rather than broken.

### Step 2 — Create the Dashboard API endpoint

Create `dashboard/app/api/dashboard/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { query, queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // KPI 1: Active experiments count
  const activeRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM experiments WHERE customer_id = $1 AND status = 'running'`,
    [customer.id]
  );
  const activeCount = parseInt(activeRow?.count || "0", 10);

  // KPI 2: Total events (from raw_events for the demo; in production this would be a faster aggregate)
  const eventsRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_events`
  );
  const totalEvents = parseInt(eventsRow?.count || "0", 10);

  // KPI 3: Total users assigned
  const usersRow = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id)::text as count FROM raw_assignments`
  );
  const totalUsers = parseInt(usersRow?.count || "0", 10);

  // KPI 4: Average CUPED variance reduction across running experiments
  // We pull from STATS#cuped items via the existing results logic
  const experiments = await query<{ id: string; slug: string; name: string; status: string }>(
    `SELECT id, slug, name, status FROM experiments WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customer.id]
  );
  
  // For each running experiment, get its results so we can extract variance_reduction_pct
  let cupedSum = 0;
  let cupedCount = 0;
  const experimentSummaries: any[] = [];
  
  for (const exp of experiments) {
    try {
      // Reuse the shared results function
      const { computeExperimentResults } = await import("@/lib/experiment-results");
      const results = await computeExperimentResults(exp.id, customer.id);
      if (!results) continue;
      
      const controlVR = results.variants?.find((v: any) => v.name === "control")?.variance_reduction_pct;
      const treatmentVR = results.variants?.find((v: any) => v.name === "treatment")?.variance_reduction_pct;
      // Average across variants for this experiment, if both present
      let expVR: number | null = null;
      if (controlVR != null && treatmentVR != null) {
        expVR = (controlVR + treatmentVR) / 2;
      } else if (controlVR != null) {
        expVR = controlVR;
      } else if (treatmentVR != null) {
        expVR = treatmentVR;
      }
      
      if (expVR != null && exp.status === "running") {
        cupedSum += expVR;
        cupedCount += 1;
      }
      
      experimentSummaries.push({
        id: exp.id,
        slug: exp.slug,
        name: exp.name,
        status: exp.status,
        lift: results.lift,
        p_value: results.p_value,
        msprt_p_value: results.msprt_p_value,
        srm_flag: results.srm_flag,
        n_total: results.variants?.reduce((s: number, v: any) => s + (v.n || 0), 0) || 0,
      });
    } catch (err) {
      console.warn(`Failed to load results for ${exp.id}:`, err);
    }
  }
  
  const avgCupedVR = cupedCount > 0 ? cupedSum / cupedCount : null;

  // Activity feed: combine recent readouts, SRM detections (we'll just use readouts for now since SRM events aren't timestamped)
  const recentReadouts = await query<any>(
    `SELECT r.id, r.experiment_id, r.verdict, r.summary, r.confidence, r.generated_at,
            e.slug as experiment_slug, e.name as experiment_name
     FROM readouts r
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1
     ORDER BY r.generated_at DESC
     LIMIT 5`,
    [customer.id]
  );

  // dbt last refresh time (from mart_segment_results)
  const dbtRow = await queryOne<{ max_computed_at: string }>(
    `SELECT MAX(computed_at)::text as max_computed_at FROM mart_segment_results`
  );

  // Build activity feed items
  const activity: Array<{
    type: string;
    title: string;
    subtitle: string;
    timestamp: string;
    experiment_id?: string;
    experiment_slug?: string;
  }> = [];

  for (const r of recentReadouts) {
    activity.push({
      type: "readout",
      title: `AI Readout: ${verdictLabel(r.verdict)}`,
      subtitle: `${r.experiment_name} — ${r.confidence} confidence`,
      timestamp: r.generated_at,
      experiment_id: r.experiment_id,
      experiment_slug: r.experiment_slug,
    });
  }

  if (dbtRow?.max_computed_at) {
    activity.push({
      type: "dbt_refresh",
      title: "Analytics pipeline refreshed",
      subtitle: "dbt mart_segment_results updated",
      timestamp: dbtRow.max_computed_at,
    });
  }

  // Sort activity feed by timestamp desc
  activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return corsResponse({
    kpis: {
      active_experiments: activeCount,
      total_events: totalEvents,
      total_users: totalUsers,
      avg_cuped_variance_reduction: avgCupedVR,
    },
    experiments: experimentSummaries,
    activity: activity.slice(0, 8),
  });
}

function verdictLabel(verdict: string): string {
  const map: Record<string, string> = {
    treatment_wins: "Treatment wins",
    control_wins: "Control wins",
    no_significant_difference: "No significant difference",
    srm_invalidated: "Results invalidated (SRM)",
    insufficient_data: "Insufficient data",
  };
  return map[verdict] || verdict;
}
```

### Step 3 — Create the Dashboard page

Create `dashboard/app/(dashboard)/dashboard/page.tsx`:

```tsx
import { headers } from "next/headers";
import Link from "next/link";
import { 
  Activity, FlaskConical, Users, TrendingDown, AlertTriangle, 
  Sparkles, Zap, ArrowRight, Database 
} from "lucide-react";

const DEMO_API_KEY = "caliper_demo_key_public";

async function fetchDashboardData() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  
  const res = await fetch(`${protocol}://${host}/api/dashboard`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Failed to fetch dashboard:", await res.text());
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

const VERDICT_COLORS: Record<string, string> = {
  treatment_wins: "text-emerald-600 bg-emerald-50",
  control_wins: "text-emerald-600 bg-emerald-50",
  no_significant_difference: "text-zinc-500 bg-zinc-100",
  srm_invalidated: "text-red-600 bg-red-50",
  insufficient_data: "text-amber-600 bg-amber-50",
};

export default async function DashboardPage() {
  const data = await fetchDashboardData();

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Failed to load dashboard data. Please refresh the page.
        </div>
      </div>
    );
  }

  const { kpis, experiments, activity } = data;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0b1c30] mb-2">Dashboard</h1>
        <p className="text-[#424754]">
          Workspace overview — your experiments, your data, your insights at a glance.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Active</p>
            <FlaskConical size={16} className="text-[#0058be]" />
          </div>
          <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">{kpis.active_experiments}</p>
          <p className="text-xs text-[#727785] mt-1">Experiments running</p>
        </div>

        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Events</p>
            <Activity size={16} className="text-[#0058be]" />
          </div>
          <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">{formatNumber(kpis.total_events)}</p>
          <p className="text-xs text-[#727785] mt-1">Ingested via SDK</p>
        </div>

        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">Users</p>
            <Users size={16} className="text-[#0058be]" />
          </div>
          <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">{formatNumber(kpis.total_users)}</p>
          <p className="text-xs text-[#727785] mt-1">Assigned to variants</p>
        </div>

        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">CUPED</p>
            <TrendingDown size={16} className="text-[#0058be]" />
          </div>
          <p className="text-3xl font-bold text-[#0b1c30] tabular-nums">
            {kpis.avg_cuped_variance_reduction != null 
              ? `${kpis.avg_cuped_variance_reduction.toFixed(1)}%` 
              : "—"}
          </p>
          <p className="text-xs text-[#727785] mt-1">Avg variance reduction</p>
        </div>
      </div>

      {/* Two column layout: Active Experiments + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active experiments — takes 2 columns */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0b1c30]">Active Experiments</h2>
            <Link 
              href="/experiments" 
              className="text-sm text-[#0058be] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {experiments
              .filter((e: any) => e.status === "running")
              .map((exp: any) => (
                <Link
                  key={exp.id}
                  href={`/experiments/${exp.id}`}
                  className="block bg-white border border-[#c2c6d6] rounded-xl p-5 hover:border-[#0058be]/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-[#0b1c30]">{exp.name}</h3>
                        {exp.srm_flag && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider">
                            <AlertTriangle size={10} />
                            SRM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#727785] tabular-nums">
                        {formatNumber(exp.n_total)} users assigned
                      </p>
                    </div>
                    <div className="text-right">
                      {exp.lift != null ? (
                        <p className={`text-2xl font-bold tabular-nums ${
                          exp.lift > 0 ? "text-emerald-600" : exp.lift < 0 ? "text-red-600" : "text-[#727785]"
                        }`}>
                          {exp.lift > 0 ? "+" : ""}{(exp.lift * 100).toFixed(1)}%
                        </p>
                      ) : (
                        <p className="text-2xl font-bold text-[#727785]">—</p>
                      )}
                      <p className="text-[10px] uppercase tracking-wider text-[#727785]">Lift</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-3 border-t border-[#c2c6d6]/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-[#727785]">Classical p</span>
                      <span className="text-sm font-mono tabular-nums text-[#0b1c30]">
                        {exp.p_value != null ? exp.p_value.toFixed(4) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-[#727785]">Always-valid p</span>
                      <span className="text-sm font-mono tabular-nums text-[#0b1c30]">
                        {exp.msprt_p_value != null ? exp.msprt_p_value.toFixed(4) : "—"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>

        {/* Activity feed — takes 1 column */}
        <div className="lg:col-span-1">
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
                      <p className="text-sm font-medium text-[#0b1c30] truncate">{item.title}</p>
                      <p className="text-xs text-[#727785] truncate">{item.subtitle}</p>
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
    </div>
  );
}
```

### Step 4 — Update the marketing page's Dashboard button

In `dashboard/app/page.tsx`, find the "Dashboard →" button (top-right corner of the marketing page) and the "Try the demo →" button. Both should `href` to `/dashboard` so the user enters the app at the Dashboard.

Search for these patterns and update the hrefs accordingly:

```tsx
// Find: <Link href="/experiments"> or <Link href="/">
// Change to: <Link href="/dashboard">
```

Only change buttons that should lead INTO the app. Leave any "Caliper" logo at top-left pointing at `/` if it exists.

### Step 5 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface DashboardKPIs {
  active_experiments: number;
  total_events: number;
  total_users: number;
  avg_cuped_variance_reduction: number | null;
}

export interface DashboardActivityItem {
  type: string;
  title: string;
  subtitle: string;
  timestamp: string;
  experiment_id?: string;
  experiment_slug?: string;
}

export interface DashboardData {
  kpis: DashboardKPIs;
  experiments: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    lift: number | null;
    p_value: number | null;
    msprt_p_value: number | null;
    srm_flag: any;
    n_total: number;
  }>;
  activity: DashboardActivityItem[];
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ Visiting `/dashboard` returns the new page with real data (not 404)
3. ✅ Clicking "Dashboard" in the sidebar from any page navigates to `/dashboard`
4. ✅ The Dashboard nav item shows as active (blue highlight) when on `/dashboard`
5. ✅ Active experiments widget shows all 3 experiments with real lift, p-value, msprt_p_value
6. ✅ `nav_layout_test` shows the SRM badge in the active experiments list
7. ✅ Activity feed shows the most recent readouts and dbt refresh timestamp
8. ✅ Marketing page's "Dashboard →" and "Try the demo →" buttons go to `/dashboard`
9. ✅ Metrics and Settings sidebar items show as disabled "soon" badges (no broken links)

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/dashboard` on production (deploy via git push first)
3. Confirmation that clicking "Dashboard" in the sidebar from `/experiments/[id]` correctly navigates to `/dashboard`
4. Confirmation that the marketing page's Dashboard button now goes to `/dashboard` (not `/experiments` or `/`)

If anything fails, stop and tell me. Don't paper over.

---

Begin. Execute steps in order 1 → 2 → 3 → 4 → 5.
