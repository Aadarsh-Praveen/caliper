import type { ReactNode } from "react";
import { headers } from "next/headers";
import {
  KeyRound, Calculator, Sparkles, Database, GitBranch,
  Code, Zap, CheckCircle2, GitFork, ExternalLink,
} from "lucide-react";
import type { SettingsPageData } from "@/lib/types";

const DEMO_API_KEY = "caliper_demo_key_public";

async function fetchSettingsData(): Promise<SettingsPageData | null> {
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
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ConfigRow({
  label,
  value,
  mono = false,
  badge,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  badge?: { text: string; color: string };
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#dde3f0]/50 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0 shrink-0 mr-4">
        <span className="text-sm text-[#424754] whitespace-nowrap">{label}</span>
        {badge && (
          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <span className={`text-sm text-[#0b1c30] text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const data = await fetchSettingsData();
  const counts = data?.counts ?? {
    readouts_generated: 0,
    experiments_created: 0,
    events_ingested: 0,
    assignments_total: 0,
  };
  const dbtLastRun = data?.dbt_last_run ?? null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-bold text-[#0b1c30] tracking-tight mb-1">Settings</h1>
        <p className="text-[#424754] text-sm">
          Configuration browser for your Caliper deployment. All values are read-only and reflect the live system state.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── 1. API & SDK ─────────────────────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <KeyRound size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">API &amp; SDK</h2>
              <p className="text-xs text-[#727785]">Endpoints and credentials for the Caliper ingestion SDK</p>
            </div>
          </div>

          <div className="mb-5">
            <ConfigRow label="API endpoint"     value="https://caliper-xi.vercel.app/api" mono />
            <ConfigRow
              label="Demo API key"
              value={
                <span className="font-mono text-xs bg-[#eff4ff] px-2 py-1 rounded">
                  caliper_demo_key_public
                </span>
              }
            />
            <ConfigRow label="Authentication"   value="X-API-Key header"          mono />
            <ConfigRow label="Rate limits"      value="Unconfigured (demo)" />
          </div>

          {/* Code snippet */}
          <div className="bg-[#0b1c30] rounded-lg p-4 text-xs font-mono text-[#c2c6d6] overflow-x-auto">
            <div className="text-[#727785] mb-2">{"// Example: track an event"}</div>
            <div>
              <span className="text-[#7c3aed]">await</span>{" "}caliper.track({"{"}<br />
              {"  "}user_id: <span className="text-emerald-400">&apos;user_abc&apos;</span>,<br />
              {"  "}event_name: <span className="text-emerald-400">&apos;buy_section_view&apos;</span>,<br />
              {"  "}experiment_id: <span className="text-emerald-400">&apos;hero_cta_test&apos;</span><br />
              {"}"});
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#dde3f0]/50">
            <a
              href="https://github.com/Aadarsh-Praveen/caliper"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-[#0058be] hover:underline"
            >
              <GitFork size={14} />
              GitHub repository
              <ExternalLink size={12} />
            </a>
          </div>
        </section>

        {/* ── 2. Statistical Configuration ─────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <Calculator size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Statistical Configuration</h2>
              <p className="text-xs text-[#727785]">Thresholds and parameters used by the aggregator</p>
            </div>
          </div>

          <div className="mb-5">
            <ConfigRow label="Confidence level"         value="95% (α = 0.05)"                          mono />
            <ConfigRow label="Test direction"           value="Two-sided" />
            <ConfigRow label="SRM detection alpha"      value="0.0001"                                  mono badge={{ text: "Statsig/Eppo Std", color: "bg-[#eff4ff] text-[#0058be]" }} />
            <ConfigRow label="mSPRT prior tau (τ)"      value="0.1"                                     mono />
            <ConfigRow label="CUPED variance reduction" value="Enabled (auto-fit per experiment)" />
            <ConfigRow label="Bonferroni correction"    value="Not applied (single-comparison)" />
          </div>

          <div className="pt-4 border-t border-[#dde3f0]/50">
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

        {/* ── 3. AI Readouts ───────────────────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <Sparkles size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">AI Readouts</h2>
              <p className="text-xs text-[#727785]">Bedrock-powered narrative summaries of experiment results</p>
            </div>
          </div>

          <ConfigRow label="Provider"              value="Amazon Bedrock" />
          <ConfigRow label="Primary model"         value="claude-haiku-4-5"                                    mono />
          <ConfigRow label="Fallback model"        value="amazon.nova-lite-v1:0"                               mono />
          <ConfigRow label="Region"                value="us-east-1"                                           mono />
          <ConfigRow label="Max tokens / readout"  value="600"                                                 mono />
          <ConfigRow label="Temperature"           value="0.3"                                                 mono />
          <ConfigRow label="Output format"         value="Structured JSON (verdict, summary, recommendation, confidence)" />
          <ConfigRow label="Triggers"              value="On-demand + auto on experiment stop" />
          <ConfigRow
            label="Readouts generated"
            value={counts.readouts_generated.toLocaleString()}
            mono
            badge={{ text: "Live", color: "bg-emerald-50 text-emerald-700" }}
          />
        </section>

        {/* ── 4. Data & Storage ────────────────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <Database size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Data &amp; Storage</h2>
              <p className="text-xs text-[#727785]">Multi-database architecture for hot ingestion + warm analytics</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="border border-[#dde3f0] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={13} className="text-amber-500" />
                <span className="text-[10px] uppercase tracking-wider text-[#424754] font-semibold">Hot Store</span>
              </div>
              <p className="text-sm font-bold text-[#0b1c30] mb-0.5">DynamoDB</p>
              <p className="text-xs text-[#727785] font-mono mb-3">caliper-main</p>
              <div className="space-y-1.5 text-xs text-[#424754]">
                {["On-demand billing", "NEW_AND_OLD_IMAGES streams", "Single-table design (PK/SK + GSI1)"].map((f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#dde3f0] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={13} className="text-[#0058be]" />
                <span className="text-[10px] uppercase tracking-wider text-[#424754] font-semibold">Warm Store</span>
              </div>
              <p className="text-sm font-bold text-[#0b1c30] mb-0.5">Aurora PostgreSQL</p>
              <p className="text-xs text-[#727785] font-mono mb-3">PostgreSQL 17.7</p>
              <div className="space-y-1.5 text-xs text-[#424754]">
                {["Serverless v2 (0.5–2 ACU)", "SSL required", "dbt-modeled mart layer"].map((f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-1">
            <ConfigRow label="Region"                      value="us-east-1"                              mono />
            <ConfigRow
              label="Events ingested (lifetime)"
              value={counts.events_ingested.toLocaleString()}
              mono
              badge={{ text: "Live", color: "bg-emerald-50 text-emerald-700" }}
            />
            <ConfigRow
              label="User assignments (lifetime)"
              value={counts.assignments_total.toLocaleString()}
              mono
              badge={{ text: "Live", color: "bg-emerald-50 text-emerald-700" }}
            />
          </div>
        </section>

        {/* ── 5. Analytics Pipeline (dbt) ──────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <GitBranch size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Analytics Pipeline</h2>
              <p className="text-xs text-[#727785]">Scheduled dbt-core on AWS Lambda for segment-level analytics</p>
            </div>
          </div>

          <div className="mb-5">
            <ConfigRow label="Engine"             value="dbt-core 1.8.0 + dbt-postgres"    mono />
            <ConfigRow label="Deployment"         value="AWS Lambda container image" />
            <ConfigRow label="Function"           value="caliper-dbt-runner"               mono />
            <ConfigRow label="Image registry"     value="ECR (caliper-dbt)"               mono />
            <ConfigRow label="Schedule"           value="Every 15 minutes"                badge={{ text: "EventBridge", color: "bg-[#eff4ff] text-[#0058be]" }} />
            <ConfigRow label="Models"             value="4 (staging × 2, intermediate, mart)" />
            <ConfigRow label="Tests"              value="26 dbt tests + 1 custom assertion" />
            <ConfigRow
              label="Last successful run"
              value={formatRelativeTime(dbtLastRun)}
              badge={dbtLastRun ? { text: "Healthy", color: "bg-emerald-50 text-emerald-700" } : undefined}
            />
          </div>

          <div className="pt-4 border-t border-[#dde3f0]/50">
            <p className="text-xs text-[#424754] mb-2 font-semibold">Model layers:</p>
            <div className="flex flex-wrap gap-2">
              {["stg_events", "stg_assignments", "int_user_outcomes", "mart_segment_results"].map((m) => (
                <span key={m} className="px-3 py-1 rounded-md bg-[#eff4ff] text-[#0058be] text-xs font-mono border border-[#0058be]/20">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. Real-Time Aggregator ──────────────────────────── */}
        <section className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-[#eff4ff] shrink-0">
              <Code size={17} className="text-[#0058be]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Real-Time Aggregator</h2>
              <p className="text-xs text-[#727785]">Stream-driven Lambda computing statistics on every event batch</p>
            </div>
          </div>

          <div className="mb-5">
            <ConfigRow label="Function"    value="caliper-aggregator"                                mono />
            <ConfigRow label="Runtime"     value="Python 3.12 on arm64"                             mono />
            <ConfigRow label="Trigger"     value="DynamoDB Streams (caliper-main)"                 mono />
            <ConfigRow label="Cold start"  value="~3ms"                                            mono badge={{ text: "Pure Python Stats", color: "bg-emerald-50 text-emerald-700" }} />
            <ConfigRow label="Layer"       value="AWSSDKPandas-Python312-Arm64:27"                 mono />
            <ConfigRow label="Unit tests"  value="33 (validated vs scipy reference)" />
          </div>

          <div className="pt-4 border-t border-[#dde3f0]/50">
            <p className="text-xs text-[#424754] mb-2 font-semibold">Pure Python implementations:</p>
            <div className="space-y-1 text-xs font-mono text-[#424754]">
              <div>• Normal CDF via math.erf (C library precision)</div>
              <div>• Normal PPF via AS241 (Wichura 1988, accuracy 1e&#8209;9)</div>
              <div>• Regularized incomplete beta via Lentz&apos;s continued fraction</div>
              <div>• Regularized lower incomplete gamma for χ² p-values</div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-xs text-[#9ba8c0]">
            Caliper · Built for the H0 Hackathon · Track 2 (Monetizable B2B)
          </p>
        </div>
      </div>
    </div>
  );
}
