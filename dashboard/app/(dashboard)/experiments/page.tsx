"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal, ArrowUpDown, Clock, Target, Users, AlertTriangle, Sparkles } from "lucide-react";
import type { Experiment, DashboardTimeseries, ExperimentListResponse } from "@/lib/types";
import { LiftSparkline } from "@/components/charts/LiftSparkline";

const DEMO_API_KEY = "caliper_demo_key_public";

interface ExperimentWithStats extends Experiment {
  sample_size?: number;
  p_value?: number | null;
  msprt_p_value?: number | null;
  msprt_should_stop?: boolean;
}

const STATUS_CFG = {
  running:   { label: "Running",   badge: "bg-[#0058be]/10 text-[#0058be]"  },
  stopped:   { label: "Stopped",   badge: "bg-[#924700]/10 text-[#924700]"  },
  completed: { label: "Completed", badge: "bg-green-50 text-green-700"       },
  draft:     { label: "Draft",     badge: "bg-[#c2c6d6]/60 text-[#424754]"  },
} as const;

// Fixed pixel heights (out of 56px parent) — percentages don't resolve in flex children
const SPARKLINE = [
  { px: 16, dark: false },
  { px: 20, dark: false },
  { px: 25, dark: false },
  { px: 31, dark: false },
  { px: 36, dark: false },
  { px: 56, dark: true  },
  { px: 49, dark: true  },
  { px: 53, dark: true  },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

type Filter = "all" | "running" | "archived";

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sparklines, setSparklines] = useState<DashboardTimeseries["sparklines"]>({});
  const [tsLoading, setTsLoading] = useState(true);
  const [srmAlerts, setSrmAlerts] = useState<number>(0);
  const [readoutsGenerated, setReadoutsGenerated] = useState<number>(0);

  useEffect(() => {
    fetch("/api/experiments", { headers: { "X-API-Key": DEMO_API_KEY } })
      .then((r) => r.json())
      .then((data: ExperimentListResponse | ExperimentWithStats[]) => {
        if (Array.isArray(data)) {
          setExperiments(data);
        } else {
          setExperiments((data.experiments as ExperimentWithStats[]) ?? []);
          setSrmAlerts(data.srm_alerts ?? 0);
          setReadoutsGenerated(data.readouts_generated ?? 0);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load experiments"); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/timeseries", { headers: { "X-API-Key": DEMO_API_KEY } })
      .then((r) => r.json())
      .then((data: DashboardTimeseries) => {
        if (!cancelled) {
          setSparklines(data.sparklines ?? {});
          setTsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load timeseries:", err);
          setTsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const running  = experiments.filter((e) => e.status === "running");
  const archived = experiments.filter((e) => e.status === "completed" || e.status === "stopped");
  const totalTraffic = experiments.reduce((s, e) => s + (e.sample_size ?? 0), 0);

  const filtered =
    filter === "running"  ? running :
    filter === "archived" ? archived :
    experiments;

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
        <div>
          <h1 className="text-[36px] font-bold text-[#0b1c30] tracking-tight leading-tight mb-2">
            Experiments
          </h1>
          <p className="text-[#424754] text-base leading-relaxed max-w-2xl">
            High-precision statistical engine for product optimization. Deploy, analyze, and scale winning variants across your global stack.
          </p>
        </div>
        <Link href="/experiments/new">
          <button className="bg-[#0b1c30] text-white py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-[#0b1c30]/10 shrink-0 font-semibold text-sm">
            <Plus size={18} strokeWidth={2.5} />
            New Experiment
          </button>
        </Link>
      </div>

      {/* Bento stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {/* Active */}
          <div className="bg-white border border-[#c2c6d6] p-6 rounded-xl">
            <p className="text-[11px] font-semibold text-[#424754] uppercase tracking-wider mb-2">Active</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-[22px] font-bold text-[#0b1c30]">{running.length}</p>
              <span className="text-[11px] font-semibold text-[#0058be]">↑ {running.length}</span>
            </div>
          </div>

          {/* Traffic */}
          <div className="bg-white border border-[#c2c6d6] p-6 rounded-xl">
            <p className="text-[11px] font-semibold text-[#424754] uppercase tracking-wider mb-2">Traffic</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-[22px] font-bold text-[#0b1c30]">{fmt(totalTraffic)}</p>
              <span className="text-[11px] font-semibold text-[#727785]">Total users</span>
            </div>
          </div>

          {/* SRM Alerts */}
          <div className="bg-white border border-[#c2c6d6] p-6 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-[#424754] uppercase tracking-wider">SRM Alerts</p>
              <AlertTriangle
                size={15}
                className={srmAlerts > 0 ? "text-red-600" : "text-[#9ba8c0]"}
                strokeWidth={1.8}
              />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className={`text-[22px] font-bold ${srmAlerts > 0 ? "text-red-600" : "text-[#0b1c30]"}`}>
                {srmAlerts}
              </p>
              <span className="text-[11px] font-semibold text-[#727785]">
                {srmAlerts === 0 ? "All healthy" : srmAlerts === 1 ? "Experiment flagged" : "Experiments flagged"}
              </span>
            </div>
          </div>

          {/* AI Readouts */}
          <div className="bg-white border border-[#c2c6d6] p-6 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-[#424754] uppercase tracking-wider">AI Readouts</p>
              <Sparkles size={15} className="text-[#0058be]" strokeWidth={1.8} />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-[22px] font-bold text-[#0b1c30]">{readoutsGenerated}</p>
              <span className="text-[11px] font-semibold text-[#727785]">Generated by Bedrock</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-600">{error}</div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center justify-between border-b border-[#dde3f0] mb-5">
        <div className="flex gap-7">
          {(["all", "running", "archived"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`pb-3 text-sm transition-colors border-b-2 -mb-px ${
                filter === f
                  ? "text-[#0058be] border-[#0058be] font-semibold"
                  : "text-[#424754] border-transparent hover:text-[#0b1c30]"
              }`}
            >
              {f === "all" ? "All Projects" : f === "running" ? "Running" : "Archived"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pb-2">
          <button className="p-1.5 rounded-md hover:bg-[#eff4ff] transition-colors text-[#727785]">
            <SlidersHorizontal size={16} />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#eff4ff] transition-colors text-[#727785]">
            <ArrowUpDown size={16} />
          </button>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="bg-white border border-[#dde3f0] rounded-xl p-16 text-center">
          <div className="inline-flex items-center gap-2 text-[#727785] text-sm">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin" aria-hidden>
              <circle cx="7" cy="7" r="5.5" stroke="#e2e8f0" strokeWidth="1.5" />
              <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#0058be" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Loading experiments…
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#dde3f0] rounded-xl p-16 text-center">
          <p className="text-[#0b1c30] text-sm font-semibold mb-1.5">No experiments found</p>
          <p className="text-[#727785] text-xs">Try a different filter or create a new experiment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exp) => {
            const cfg = STATUS_CFG[exp.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft;
            const pv = exp.p_value;
            const significant = pv !== null && pv !== undefined && pv < 0.05;
            const confidence  = pv !== null && pv !== undefined ? Math.round((1 - pv) * 100) : null;

            return (
              <Link key={exp.id} href={`/experiments/${exp.id}`}>
                <div className="group bg-white border border-[#dde3f0] rounded-xl overflow-hidden hover:border-[#0058be]/40 hover:shadow-lg hover:shadow-[#0058be]/5 transition-all cursor-pointer mt-3">
                  <div className="flex flex-col md:flex-row">

                    {/* Left */}
                    <div className="flex-1 p-6">
                      <div className="mb-5">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="text-[17px] font-bold text-[#0b1c30] group-hover:text-[#0058be] transition-colors">
                            {exp.name}
                          </h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9ba8c0] uppercase tracking-widest font-semibold">
                          ID: {exp.slug.toUpperCase()}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-[#9ba8c0] uppercase font-semibold tracking-wider mb-2">Primary Metric</p>
                          <div className="flex items-center gap-2">
                            <Target size={14} className="text-[#0058be]" strokeWidth={1.8} />
                            <span className="text-sm font-medium text-[#0b1c30]">{exp.primary_metric}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#9ba8c0] uppercase font-semibold tracking-wider mb-2">Exposure</p>
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-[#0058be]" strokeWidth={1.8} />
                            <span className="text-sm font-medium text-[#0b1c30]">
                              {exp.sample_size != null ? fmt(exp.sample_size) : "—"} users
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right panel */}
                    <div className="w-full md:w-60 bg-[#f0f4ff] border-l border-[#dde3f0] p-5 flex flex-col justify-between">
                      {exp.status === "draft" ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
                          <Clock size={36} className="text-[#c2c6d6]" strokeWidth={1} />
                          <p className="text-[10px] text-[#9ba8c0] uppercase tracking-widest font-semibold">
                            Awaiting Samples
                          </p>
                        </div>
                      ) : exp.status === "running" ? (
                        <>
                          <div>
                            <p className="text-[10px] text-[#9ba8c0] uppercase font-semibold tracking-wider mb-3">Cumulative Lift</p>
                            {tsLoading ? (
                              <div className="h-14 w-full flex items-center justify-center">
                                <span className="text-[10px] text-[#c2c6d6]">Loading chart data…</span>
                              </div>
                            ) : sparklines[exp.id] ? (
                              <LiftSparkline data={sparklines[exp.id]} width={192} height={56} />
                            ) : (
                              <div className="h-14 w-full flex items-end gap-[3px]">
                                {SPARKLINE.map(({ px, dark }, i) => (
                                  <div
                                    key={i}
                                    className="flex-1 rounded-t-[2px]"
                                    style={{
                                      height: px,
                                      backgroundColor: dark
                                        ? "#1752c5"
                                        : `rgba(23,82,197,${0.13 + i * 0.04})`,
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <div className="w-6 h-0.5 bg-[#1752c5] rounded-full" />
                            <span className="text-[11px] text-[#9ba8c0] font-semibold">P-Value · 95% CI</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-[11px] text-[#c2c6d6] uppercase font-semibold mb-3">Significance</p>
                            <div className="w-full bg-[#dce9ff] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${significant ? "bg-[#10b981]" : "bg-[#0058be]"}`}
                                style={{ width: `${confidence ?? 0}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <span className={`text-[22px] font-bold ${significant ? "text-[#10b981]" : "text-[#0058be]"}`}>
                              {confidence !== null ? `${confidence}%` : "—"}
                            </span>
                            <span className="text-[11px] text-[#727785] font-semibold">
                              P-Value {pv !== null && pv !== undefined ? pv.toFixed(3) : "—"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div className="mt-12 flex items-center justify-between border-t border-[#c2c6d6] pt-6">
          <p className="text-sm text-[#424754]">
            Showing {filtered.length} of {experiments.length} experiment{experiments.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
