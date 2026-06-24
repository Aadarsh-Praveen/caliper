# Caliper Phase 5.3 — Settings Page

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

The sidebar nav has a "Settings" item currently marked as disabled ("soon"). We're now building the real Settings page.

This page sits at `/settings` — same `(dashboard)` route group, same sidebar layout as Dashboard, Experiments, and Metrics.

**Framing**: Settings is a **configuration browser**, not an editable form. We display the actual deployed config of the Caliper platform — API endpoint, statistical thresholds, LLM model IDs, data store details, dbt schedule, aggregator config. Everything is read-only. There are no "Edit" buttons, no "Save" actions, no auth-required fields. This is honest for a hackathon demo and genuinely useful info.

**What we are NOT building**:
- ❌ No editable form fields
- ❌ No "Save" or "Edit" actions
- ❌ No user account / profile section (we have no users)
- ❌ No workspace management (single demo workspace)
- ❌ No team / collaborators (single user)
- ❌ No billing / subscription
- ❌ No notification preferences
- ❌ No audit log
- ❌ No "Danger Zone" delete actions
- ❌ No theme switcher

## 1. Files to create or modify

```
dashboard/app/(dashboard)/settings/page.tsx       ← CREATE the Settings page
dashboard/app/api/settings/route.ts               ← CREATE API endpoint (for dynamic counts)
dashboard/app/(dashboard)/layout.tsx              ← ENABLE the Settings nav link
dashboard/lib/types.ts                            ← ADD SettingsPageData type
```

## 2. Step-by-step

### Step 1 — Enable the Settings nav link

In `dashboard/app/(dashboard)/layout.tsx`:

**Before:**
```typescript
{ label: "Settings", href: "/settings", icon: Settings, disabled: true },
```

**After:**
```typescript
{ label: "Settings", href: "/settings", icon: Settings },
```

(Remove `, disabled: true`.)

### Step 2 — Build the Settings API endpoint

Create `dashboard/app/api/settings/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne } from "@/lib/postgres";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);

  // Pull dynamic counts that we want to show as live config state
  const readoutCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM readouts r 
     JOIN experiments e ON r.experiment_id = e.id
     WHERE e.customer_id = $1`,
    [customer.id]
  );

  const experimentCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM experiments WHERE customer_id = $1`,
    [customer.id]
  );

  const dbtLastRun = await queryOne<{ max_computed_at: string }>(
    `SELECT MAX(computed_at)::text as max_computed_at FROM mart_segment_results`
  );

  const totalEvents = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_events`
  );

  const totalAssignments = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM raw_assignments`
  );

  return corsResponse({
    counts: {
      readouts_generated: parseInt(readoutCount?.count || "0", 10),
      experiments_created: parseInt(experimentCount?.count || "0", 10),
      events_ingested: parseInt(totalEvents?.count || "0", 10),
      assignments_total: parseInt(totalAssignments?.count || "0", 10),
    },
    dbt_last_run: dbtLastRun?.max_computed_at || null,
  });
}
```

### Step 3 — Build the Settings page

Create `dashboard/app/(dashboard)/settings/page.tsx`:

```tsx
import { headers } from "next/headers";
import { 
  KeyRound, Calculator, Sparkles, Database, GitBranch, Zap,
  Github, ExternalLink, CheckCircle2, Code, BookOpen
} from "lucide-react";

const DEMO_API_KEY = "caliper_demo_key_public";

async function fetchSettingsData() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  
  const res = await fetch(`${protocol}://${host}/api/settings`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "never";
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

function ConfigRow({ label, value, mono = false, badge }: { 
  label: string; 
  value: React.ReactNode; 
  mono?: boolean;
  badge?: { text: string; color: string };
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#c2c6d6]/30 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#424754]">{label}</span>
        {badge && (
          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <span className={`text-sm text-[#0b1c30] ${mono ? "font-mono" : ""} text-right`}>
        {value}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const data = await fetchSettingsData();
  const counts = data?.counts || { 
    readouts_generated: 0, 
    experiments_created: 0,
    events_ingested: 0,
    assignments_total: 0,
  };
  const dbtLastRun = data?.dbt_last_run;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0b1c30] mb-2">Settings</h1>
        <p className="text-[#424754]">
          Configuration browser for your Caliper deployment. All values are read-only and reflect the live system state.
        </p>
      </div>

      <div className="space-y-6">

        {/* Section 1: API & SDK */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <KeyRound size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">API & SDK</h2>
              <p className="text-xs text-[#727785]">Endpoints and credentials for the Caliper ingestion SDK</p>
            </div>
          </div>
          
          <div className="space-y-0 mb-4">
            <ConfigRow 
              label="API endpoint" 
              value="https://caliper-xi.vercel.app/api" 
              mono 
            />
            <ConfigRow 
              label="Demo API key" 
              value={
                <span className="font-mono text-xs bg-[#eff4ff] px-2 py-1 rounded">
                  caliper_demo_key_public
                </span>
              } 
            />
            <ConfigRow 
              label="Authentication" 
              value="X-API-Key header" 
              mono 
            />
            <ConfigRow 
              label="Rate limits" 
              value="Unconfigured (demo)" 
            />
          </div>

          <div className="bg-[#0b1c30] rounded-lg p-4 text-xs font-mono text-[#c2c6d6] overflow-x-auto">
            <div className="text-[#727785] mb-2">// Example: track an event</div>
            <div>
              <span className="text-[#7c3aed]">await</span> caliper.track({"{"}<br />
              {"  "}user_id: <span className="text-emerald-400">'user_abc'</span>,<br />
              {"  "}event_name: <span className="text-emerald-400">'buy_section_view'</span>,<br />
              {"  "}experiment_id: <span className="text-emerald-400">'hero_cta_test'</span><br />
              {"}"});
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#c2c6d6]/30">
            <a 
              href="https://github.com/Aadarsh-Praveen/caliper" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-[#0058be] hover:underline"
            >
              <Github size={14} />
              GitHub repository
              <ExternalLink size={12} />
            </a>
          </div>
        </section>

        {/* Section 2: Statistical Configuration */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <Calculator size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">Statistical Configuration</h2>
              <p className="text-xs text-[#727785]">Thresholds and parameters used by the aggregator</p>
            </div>
          </div>
          
          <div className="space-y-0">
            <ConfigRow 
              label="Confidence level" 
              value="95% (α = 0.05)" 
              mono 
            />
            <ConfigRow 
              label="Test direction" 
              value="Two-sided" 
            />
            <ConfigRow 
              label="SRM detection alpha" 
              value="0.0001" 
              mono
              badge={{ text: "Statsig/Eppo Std", color: "bg-[#eff4ff] text-[#0058be]" }}
            />
            <ConfigRow 
              label="mSPRT prior tau (τ)" 
              value="0.1" 
              mono 
            />
            <ConfigRow 
              label="CUPED variance reduction" 
              value="Enabled (auto-fit per experiment)" 
            />
            <ConfigRow 
              label="Bonferroni correction" 
              value="Not applied (single-comparison)" 
            />
          </div>

          <div className="mt-4 pt-4 border-t border-[#c2c6d6]/30">
            <p className="text-xs text-[#424754] mb-2 font-semibold">Active methods:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Two-proportion z-test",
                "Welch's t-test",
                "χ² SRM detection",
                "CUPED (Deng et al. 2013)",
                "mSPRT (Johari et al. 2015)",
              ].map((m) => (
                <span 
                  key={m}
                  className="px-3 py-1 rounded-md bg-[#eff4ff] text-[#0058be] text-xs font-medium border border-[#0058be]/20"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: AI Readouts */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <Sparkles size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">AI Readouts</h2>
              <p className="text-xs text-[#727785]">Bedrock-powered narrative summaries</p>
            </div>
          </div>
          
          <div className="space-y-0">
            <ConfigRow 
              label="Provider" 
              value="Amazon Bedrock" 
            />
            <ConfigRow 
              label="Primary model" 
              value="claude-haiku-4-5" 
              mono 
            />
            <ConfigRow 
              label="Fallback model" 
              value="amazon.nova-lite-v1:0" 
              mono 
            />
            <ConfigRow 
              label="Region" 
              value="us-east-1" 
              mono 
            />
            <ConfigRow 
              label="Max tokens per readout" 
              value="600" 
              mono 
            />
            <ConfigRow 
              label="Temperature" 
              value="0.3" 
              mono 
            />
            <ConfigRow 
              label="Output format" 
              value="Structured JSON (verdict, summary, recommendation, confidence)" 
            />
            <ConfigRow 
              label="Triggers" 
              value="On-demand + auto on experiment stop" 
            />
            <ConfigRow 
              label="Readouts generated" 
              value={counts.readouts_generated.toLocaleString()} 
              mono 
            />
          </div>
        </section>

        {/* Section 4: Data & Storage */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <Database size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">Data & Storage</h2>
              <p className="text-xs text-[#727785]">Multi-database architecture for hot ingestion + warm analytics</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hot store */}
            <div className="border border-[#c2c6d6]/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-amber-600" />
                <span className="text-xs uppercase tracking-wider text-[#424754] font-semibold">Hot Store</span>
              </div>
              <p className="text-base font-bold text-[#0b1c30] mb-1">DynamoDB</p>
              <p className="text-xs text-[#727785] font-mono mb-3">caliper-main</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  On-demand billing
                </div>
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  NEW_AND_OLD_IMAGES streams
                </div>
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  Single-table design (PK/SK + GSI1)
                </div>
              </div>
            </div>

            {/* Warm store */}
            <div className="border border-[#c2c6d6]/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={14} className="text-[#0058be]" />
                <span className="text-xs uppercase tracking-wider text-[#424754] font-semibold">Warm Store</span>
              </div>
              <p className="text-base font-bold text-[#0b1c30] mb-1">Aurora PostgreSQL</p>
              <p className="text-xs text-[#727785] font-mono mb-3">PostgreSQL 17.7</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  Serverless v2 (0.5-2 ACU)
                </div>
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  SSL required
                </div>
                <div className="flex items-center gap-1.5 text-[#424754]">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  dbt-modeled mart layer
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#c2c6d6]/30 space-y-0">
            <ConfigRow 
              label="Region" 
              value="us-east-1" 
              mono 
            />
            <ConfigRow 
              label="Events ingested (lifetime)" 
              value={counts.events_ingested.toLocaleString()} 
              mono 
            />
            <ConfigRow 
              label="User assignments (lifetime)" 
              value={counts.assignments_total.toLocaleString()} 
              mono 
            />
          </div>
        </section>

        {/* Section 5: Analytics Pipeline (dbt) */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <GitBranch size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">Analytics Pipeline</h2>
              <p className="text-xs text-[#727785]">Scheduled dbt-core on AWS Lambda for segment-level analytics</p>
            </div>
          </div>
          
          <div className="space-y-0">
            <ConfigRow 
              label="Engine" 
              value="dbt-core 1.8.0 + dbt-postgres" 
              mono 
            />
            <ConfigRow 
              label="Deployment" 
              value="AWS Lambda container image" 
            />
            <ConfigRow 
              label="Function" 
              value="caliper-dbt-runner" 
              mono 
            />
            <ConfigRow 
              label="Image registry" 
              value="ECR (caliper-dbt)" 
              mono 
            />
            <ConfigRow 
              label="Schedule" 
              value="Every 15 minutes" 
              badge={{ text: "EventBridge", color: "bg-[#eff4ff] text-[#0058be]" }}
            />
            <ConfigRow 
              label="Models" 
              value="4 (staging × 2, intermediate, mart)" 
            />
            <ConfigRow 
              label="Tests" 
              value="26 dbt tests + 1 custom assertion" 
            />
            <ConfigRow 
              label="Last successful run" 
              value={formatRelativeTime(dbtLastRun)} 
              badge={dbtLastRun ? { text: "Healthy", color: "bg-emerald-50 text-emerald-700" } : undefined}
            />
          </div>

          <div className="mt-4 pt-4 border-t border-[#c2c6d6]/30">
            <p className="text-xs text-[#424754] mb-2 font-semibold">Model layers:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "stg_events",
                "stg_assignments",
                "int_user_outcomes",
                "mart_segment_results",
              ].map((m) => (
                <span 
                  key={m}
                  className="px-3 py-1 rounded-md bg-[#eff4ff] text-[#0058be] text-xs font-mono border border-[#0058be]/20"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Section 6: Aggregator Pipeline */}
        <section className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#eff4ff]">
              <Code size={18} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0b1c30]">Real-Time Aggregator</h2>
              <p className="text-xs text-[#727785]">Stream-driven Lambda computing statistics on every event batch</p>
            </div>
          </div>
          
          <div className="space-y-0">
            <ConfigRow 
              label="Function" 
              value="caliper-aggregator" 
              mono 
            />
            <ConfigRow 
              label="Runtime" 
              value="Python 3.12 on arm64" 
              mono 
            />
            <ConfigRow 
              label="Trigger" 
              value="DynamoDB Streams (caliper-main)" 
              mono 
            />
            <ConfigRow 
              label="Cold start" 
              value="~3ms" 
              mono
              badge={{ text: "Pure Python Stats", color: "bg-emerald-50 text-emerald-700" }}
            />
            <ConfigRow 
              label="Layer" 
              value="AWSSDKPandas-Python312-Arm64:27" 
              mono 
            />
            <ConfigRow 
              label="Unit tests" 
              value="33 (validated vs scipy reference)" 
            />
          </div>

          <div className="mt-4 pt-4 border-t border-[#c2c6d6]/30">
            <p className="text-xs text-[#424754] mb-2 font-semibold">Pure Python implementations:</p>
            <div className="space-y-1 text-xs font-mono text-[#424754]">
              <div>• Normal CDF via math.erf (C library precision)</div>
              <div>• Normal PPF via AS241 (Wichura 1988, accuracy 1e-9)</div>
              <div>• Regularized incomplete beta via Lentz's continued fraction</div>
              <div>• Regularized lower incomplete gamma for χ² p-values</div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-xs text-[#727785]">
            Caliper · Built for the H0 Hackathon · Track 2 (Monetizable B2B)
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 4 — Add TypeScript types

In `dashboard/lib/types.ts`, add:

```typescript
export interface SettingsPageData {
  counts: {
    readouts_generated: number;
    experiments_created: number;
    events_ingested: number;
    assignments_total: number;
  };
  dbt_last_run: string | null;
}
```

## 3. Definition of done

Before declaring complete:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ Visiting `/settings` returns the new page (not 404)
3. ✅ The Settings nav link in the sidebar is enabled (no "soon" badge)
4. ✅ Clicking "Settings" from any sidebar location navigates to `/settings`
5. ✅ The Settings nav item highlights as active (blue) when on `/settings`
6. ✅ All six sections render with real values
7. ✅ The "Readouts generated" count matches the actual count in Aurora's readouts table
8. ✅ The "Last successful run" for dbt shows a real timestamp (e.g., "12m ago")
9. ✅ The GitHub repo link works and points to the correct repository
10. ✅ Visual consistency with Dashboard, Experiments, and Metrics pages (same colors, typography, card style)

## 4. What to send back when done

1. Output of `npm run build` (must be clean)
2. Screenshot of `/settings` on production after deploying
3. Confirmation that the dynamic counts are pulling from real Aurora data

If anything fails, stop and tell me.

---

Begin. Execute steps in order 1 → 2 → 3 → 4. Verify each step before moving on.
