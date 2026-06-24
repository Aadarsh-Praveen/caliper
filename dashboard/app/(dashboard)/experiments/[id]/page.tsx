"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/experiments/StatsCard";
import { SRMWarningBanner } from "@/components/experiments/SRMWarningBanner";
import { ConfidenceBandChart } from "@/components/experiments/ConfidenceBandChart";
import { SegmentTable } from "@/components/experiments/SegmentTable";
import { ReadoutCard } from "@/components/experiments/ReadoutCard";
import { MsprtCard } from "@/components/experiments/MsprtCard";
import { LiftTrendChart } from "@/components/charts/LiftTrendChart";
import { ConversionRateChart } from "@/components/charts/ConversionRateChart";
import { ConversionFunnel } from "@/components/charts/ConversionFunnel";
import type { ExperimentResults, ExperimentTimeseries } from "@/lib/types";

const DEMO_API_KEY = "caliper_demo_key_public";

const STATUS_CONFIG: Record<string, { badge: string; dot: string; pulse: boolean }> = {
  draft:     { badge: "bg-slate-100 text-slate-500 border-slate-200",  dot: "bg-slate-400",  pulse: false },
  running:   { badge: "bg-green-50 text-green-700 border-green-200",   dot: "bg-green-500",  pulse: true  },
  stopped:   { badge: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500",  pulse: false },
  completed: { badge: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500",   pulse: false },
};

function formatPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export default function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [timeseries, setTimeseries] = useState<ExperimentTimeseries | null>(null);
  const [tsLoading, setTsLoading] = useState(true);

  useEffect(() => {
    params.then(({ id }) => setId(id));
  }, [params]);

  const fetchResults = useCallback(async (experimentId: string) => {
    try {
      const res = await fetch(`/api/experiments/${experimentId}/results`, {
        headers: { "X-API-Key": DEMO_API_KEY },
      });
      const data = await res.json();
      if (res.ok) { setResults(data); setError(null); }
      else setError(data.error ?? "Failed to load results");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchResults(id);
    const interval = setInterval(() => {
      if (results?.experiment?.status === "running") fetchResults(id);
    }, 5000);
    return () => clearInterval(interval);
  }, [id, fetchResults, results?.experiment?.status]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/experiments/${id}/timeseries`, {
      headers: { "X-API-Key": DEMO_API_KEY },
    })
      .then((r) => r.json())
      .then((data: ExperimentTimeseries) => {
        if (!cancelled) {
          setTimeseries(data);
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
  }, [id]);

  async function handleStatusChange(newStatus: "running" | "stopped") {
    if (!id) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-API-Key": DEMO_API_KEY },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) await fetchResults(id);
      else setError(data.error ?? "Failed to update status");
    } catch { setError("Network error"); }
    finally { setTransitioning(false); }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-24 flex justify-center">
        <div className="inline-flex items-center gap-2.5 text-slate-400 text-sm">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin" aria-hidden>
            <circle cx="7" cy="7" r="5.5" stroke="#E2E8F0" strokeWidth="1.5" />
            <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Loading experiment…
        </div>
      </div>
    );
  }

  if (error && !results) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
        <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-slate-800 transition-colors flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </div>
    );
  }

  if (!results) return null;

  const { experiment, variants, lift, lift_ci, cuped_lift_ci, p_value, msprt_p_value, msprt_should_stop, is_significant, srm_flag, readout } = results;
  const statusCfg = STATUS_CONFIG[experiment.status] ?? STATUS_CONFIG.draft;

  const liftColor = lift === null ? "text-slate-400"
    : is_significant && lift > 0 ? "text-[#10b981]"
    : is_significant && lift < 0 ? "text-red-500"
    : "text-slate-900";

  const nTotal = variants.reduce((s, v) => s + v.n, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
      className="max-w-7xl mx-auto"
    >
      {/* Breadcrumb */}
      <button
        onClick={() => router.back()}
        className="text-[11px] text-slate-400 hover:text-slate-800 transition-colors flex items-center gap-1.5 uppercase tracking-wider font-semibold mb-5"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Experiments
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight truncate">{experiment.name}</h1>
            <span className={`inline-flex items-center shrink-0 gap-1.5 text-[11px] border px-2.5 py-1 rounded-full font-semibold ${statusCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${statusCfg.pulse ? "running-pulse" : ""}`} />
              {experiment.status}
            </span>
          </div>
          {experiment.hypothesis && (
            <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">{experiment.hypothesis}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-400 font-mono">metric: <span className="text-slate-700 font-medium">{experiment.primary_metric}</span></span>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400 font-mono">type: <span className="text-slate-700 font-medium">{experiment.metric_type}</span></span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {experiment.status === "draft" && (
            <Button onClick={() => handleStatusChange("running")} disabled={transitioning}
              className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 px-5 rounded-lg font-semibold shadow-sm">
              Start experiment
            </Button>
          )}
          {experiment.status === "running" && (
            <Button onClick={() => handleStatusChange("stopped")} disabled={transitioning}
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs h-9 px-5 rounded-lg">
              Stop Experiment
            </Button>
          )}
          {experiment.status === "stopped" && (
            <Button onClick={() => handleStatusChange("running")} disabled={transitioning}
              className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 px-5 rounded-lg font-semibold shadow-sm">
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* SRM Warning */}
      {srm_flag && (
        <SRMWarningBanner
          observed={(srm_flag as { observed: Record<string, number> }).observed}
          expected={(srm_flag as { expected: Record<string, number> }).expected}
        />
      )}

      {/* ── ROW 1: KPI bar ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-[#dde3f0] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-[#9ba8c0] font-semibold mb-3">Estimated Lift</p>
          <p className={`text-[28px] font-bold tabular-nums leading-none ${liftColor}`}>
            {lift !== null ? formatPct(lift) : "—"}
          </p>
          <p className={`text-[10px] mt-2 font-medium ${
            is_significant
              ? lift !== null && lift > 0 ? "text-[#10b981]" : "text-red-500"
              : "text-[#9ba8c0]"
          }`}>
            {lift === null
              ? "insufficient data"
              : is_significant
              ? lift > 0 ? "↑ significant improvement" : "↓ significant decline"
              : "not significant"}
          </p>
        </div>

        <div className="bg-white border border-[#dde3f0] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-[#9ba8c0] font-semibold mb-3">P-Value</p>
          <p className={`text-[28px] font-bold tabular-nums leading-none ${is_significant && p_value !== null ? "text-[#10b981]" : "text-[#0b1c30]"}`}>
            {p_value !== null ? p_value.toFixed(3) : "—"}
          </p>
          <p className={`text-[10px] mt-2 font-medium ${is_significant ? "text-[#10b981]" : "text-[#9ba8c0]"}`}>
            {p_value === null ? "no data" : is_significant ? "significant at α = 0.05" : "not significant"}
          </p>
        </div>

        <div className="bg-white border border-[#dde3f0] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-[#9ba8c0] font-semibold mb-3">95% Confidence Interval</p>
          <p className="text-base font-bold font-mono tabular-nums text-[#0b1c30] leading-snug mt-2">
            {lift_ci ? `[${formatPct(lift_ci[0])}, ${formatPct(lift_ci[1])}]` : "—"}
          </p>
          <p className="text-[10px] mt-2 text-[#9ba8c0]">Two-sided z-test</p>
        </div>

        <div className="bg-white border border-[#dde3f0] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-[#9ba8c0] font-semibold mb-3">Total Users</p>
          <p className="text-[28px] font-bold tabular-nums leading-none text-[#0b1c30]">
            {nTotal > 0 ? nTotal.toLocaleString() : "—"}
          </p>
          <p className="text-[10px] mt-2 text-[#9ba8c0]">{variants.length} variant{variants.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── ROW 2: Left analysis | Right variant data ───────── */}
      <div className="grid grid-cols-[360px_1fr] gap-5 mb-5 items-start">

        {/* Left column: AI Readout + mSPRT + CUPED */}
        <div className="space-y-4">
          {id && (
            <ReadoutCard experimentId={id} initialReadout={readout} apiKey={DEMO_API_KEY} />
          )}
          {msprt_p_value != null && (
            <MsprtCard
              msprtPValue={msprt_p_value}
              classicalPValue={p_value}
              shouldStop={msprt_should_stop ?? false}
            />
          )}
          {cuped_lift_ci && (
            <div className="rounded-xl border border-[#dde3f0] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#dde3f0] bg-[#f8f9ff]">
                <span className="text-[10px] font-semibold text-[#9ba8c0] uppercase tracking-widest">CUPED</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-[10px] text-[#424754] uppercase tracking-wider mb-1 font-semibold">Before</div>
                  <div className="font-mono text-xs text-[#424754] tabular-nums">
                    {lift_ci ? `[${formatPct(lift_ci[0])}, ${formatPct(lift_ci[1])}]` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#424754] uppercase tracking-wider mb-1 font-semibold">After CUPED</div>
                  <div className="font-mono text-xs text-[#10b981] font-semibold tabular-nums">
                    {`[${formatPct(cuped_lift_ci[0])}, ${formatPct(cuped_lift_ci[1])}]`}
                  </div>
                </div>
                {(() => {
                  const ctrl = variants.find((v) => v.name === "control");
                  const pct = ctrl?.variance_reduction_pct?.toFixed(1);
                  return pct ? (
                    <div className="text-xs text-[#10b981] font-semibold">{pct}% variance reduction</div>
                  ) : null;
                })()}
                <p className="text-[10px] text-[#9ba8c0] leading-relaxed">
                  Pre-experiment covariate adjustment (Deng et al. 2013)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Variant cards + Conversion rate snapshot */}
        <div className="space-y-4">
          {variants.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {variants.map((v) => (
                <StatsCard key={v.name} stat={v} isControl={v.name === "control"} />
              ))}
            </div>
          )}
          <div className="rounded-xl border border-[#dde3f0] bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-[#dde3f0] bg-[#f8f9ff]">
              <span className="text-[10px] font-semibold text-[#9ba8c0] uppercase tracking-widest">Conversion Rates</span>
            </div>
            <div className="p-5">
              <ConfidenceBandChart variants={variants} />
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Time series charts side by side ──────────── */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <h3 className="text-sm font-bold text-[#0b1c30] mb-0.5">Cumulative Lift Trend</h3>
          <p className="text-xs text-[#727785] mb-4">How treatment vs control lift has evolved day-over-day</p>
          {tsLoading ? (
            <div className="text-center text-[#727785] py-8">Loading chart data…</div>
          ) : (
            <LiftTrendChart data={timeseries?.daily_lift ?? []} />
          )}
        </div>
        <div className="bg-white border border-[#dde3f0] rounded-xl p-6">
          <h3 className="text-sm font-bold text-[#0b1c30] mb-0.5">Conversion Rate by Variant</h3>
          <p className="text-xs text-[#727785] mb-4">Control vs treatment conversion rate trajectory</p>
          {tsLoading ? (
            <div className="text-center text-[#727785] py-8">Loading chart data…</div>
          ) : (
            <ConversionRateChart data={timeseries?.daily_lift ?? []} />
          )}
        </div>
      </div>

      {/* ── ROW 4: Funnel ───────────────────────────────────── */}
      <div className="bg-white border border-[#dde3f0] rounded-xl p-6 mb-5">
        <h3 className="text-sm font-bold text-[#0b1c30] mb-0.5">Conversion Funnel</h3>
        <p className="text-xs text-[#727785] mb-4">User flow from assignment to primary metric conversion</p>
        {tsLoading ? (
          <div className="text-center text-[#727785] py-8">Loading chart data…</div>
        ) : (
          <ConversionFunnel data={timeseries?.funnel ?? []} />
        )}
      </div>

      {/* ── ROW 5: Segment Breakdown ────────────────────────── */}
      <div className="rounded-xl border border-[#dde3f0] bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-[#dde3f0] bg-[#f8f9ff]">
          <span className="text-[10px] font-semibold text-[#9ba8c0] uppercase tracking-widest">Segment Breakdown</span>
        </div>
        <div className="p-5">
          <SegmentTable segments={results.segments} />
        </div>
      </div>
    </motion.div>
  );
}
