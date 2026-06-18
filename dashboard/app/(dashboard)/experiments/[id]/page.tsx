"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/experiments/StatsCard";
import { SRMWarningBanner } from "@/components/experiments/SRMWarningBanner";
import { ConfidenceBandChart } from "@/components/experiments/ConfidenceBandChart";
import { SegmentTable } from "@/components/experiments/SegmentTable";
import type { ExperimentResults } from "@/lib/types";

const DEMO_API_KEY = "caliper_demo_key_public";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[#2A2A2A] text-[#888888] border-[#2A2A2A]",
  running: "bg-green-950 text-green-400 border-green-800",
  stopped: "bg-yellow-950 text-yellow-400 border-yellow-800",
  completed: "bg-blue-950 text-blue-400 border-blue-800",
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

  useEffect(() => {
    params.then(({ id }) => setId(id));
  }, [params]);

  const fetchResults = useCallback(async (experimentId: string) => {
    try {
      const res = await fetch(`/api/experiments/${experimentId}/results`, {
        headers: { "X-API-Key": DEMO_API_KEY },
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data);
        setError(null);
      } else {
        setError(data.error ?? "Failed to load results");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchResults(id);

    const interval = setInterval(() => {
      if (results?.experiment?.status === "running") {
        fetchResults(id);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, fetchResults, results?.experiment?.status]);

  async function handleStatusChange(newStatus: "running" | "stopped") {
    if (!id) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": DEMO_API_KEY,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchResults(id);
      } else {
        setError(data.error ?? "Failed to update status");
      }
    } catch {
      setError("Network error");
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-12 text-center text-[#888888]">
        Loading experiment...
      </div>
    );
  }

  if (error && !results) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded border border-red-700 bg-red-950 p-4 text-sm text-red-300">
          {error}
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-[#888888] hover:text-[#F5F3EE]"
        >
          ← Back
        </button>
      </div>
    );
  }

  if (!results) return null;

  const { experiment, variants, lift, lift_ci, p_value, is_significant, srm_flag } = results;
  const control = variants.find((v) => v.name === "control") ?? variants[0];
  const treatment = variants.find((v) => v.name !== "control") ?? variants[1];

  const liftColor =
    lift === null
      ? "text-[#888888]"
      : is_significant && lift > 0
      ? "text-green-400"
      : is_significant && lift < 0
      ? "text-red-400"
      : "text-[#888888]";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Bedrock readout placeholder */}
      {/* Hidden when readout is null per spec */}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-[#F5F3EE]">{experiment.name}</h1>
            <Badge
              className={`text-xs border ${STATUS_COLORS[experiment.status] ?? ""}`}
              variant="outline"
            >
              {experiment.status}
            </Badge>
          </div>
          {experiment.hypothesis && (
            <p className="text-sm text-[#888888] leading-relaxed max-w-2xl">
              {experiment.hypothesis}
            </p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-[#888888]">
            <span className="font-mono">
              metric: <span className="text-[#F5F3EE]">{experiment.primary_metric}</span>
            </span>
            <span className="font-mono">
              type: <span className="text-[#F5F3EE]">{experiment.metric_type}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {experiment.status === "draft" && (
            <Button
              onClick={() => handleStatusChange("running")}
              disabled={transitioning}
              className="bg-green-700 hover:bg-green-600 text-white text-sm"
            >
              Start experiment
            </Button>
          )}
          {experiment.status === "running" && (
            <Button
              onClick={() => handleStatusChange("stopped")}
              disabled={transitioning}
              variant="outline"
              className="border-[#2A2A2A] text-[#888888] hover:text-[#F5F3EE] text-sm"
            >
              Stop experiment
            </Button>
          )}
          {experiment.status === "stopped" && (
            <Button
              onClick={() => handleStatusChange("running")}
              disabled={transitioning}
              className="bg-green-700 hover:bg-green-600 text-white text-sm"
            >
              Resume experiment
            </Button>
          )}
        </div>
      </div>

      {/* SRM warning */}
      {srm_flag && (
        <SRMWarningBanner
          observed={(srm_flag as { observed: Record<string, number> }).observed}
          expected={(srm_flag as { expected: Record<string, number> }).expected}
        />
      )}

      {/* Stats cards */}
      <div className="flex gap-4">
        {variants.map((v) => (
          <StatsCard
            key={v.name}
            stat={v}
            isControl={v.name === "control"}
          />
        ))}
      </div>

      {/* Lift summary */}
      {control && treatment && (
        <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-6">
          <h2 className="text-xs text-[#888888] uppercase tracking-wider mb-4">Lift summary</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className={`text-3xl font-bold ${liftColor}`}>
                {lift !== null ? formatPct(lift) : "—"}
              </div>
              <div className="text-xs text-[#888888] mt-1">
                {experiment.primary_metric} lift (treatment vs control)
              </div>
            </div>
            <div>
              <div className="text-xl font-semibold text-[#F5F3EE]">
                {p_value !== null ? p_value.toFixed(3) : "—"}
              </div>
              <div className="text-xs text-[#888888] mt-1">
                p-value —{" "}
                {p_value === null
                  ? "insufficient data"
                  : is_significant
                  ? "statistically significant"
                  : "not significant"}
              </div>
            </div>
            <div>
              <div className="text-xl font-semibold text-[#F5F3EE]">
                {lift_ci
                  ? `[${formatPct(lift_ci[0])}, ${formatPct(lift_ci[1])}]`
                  : "—"}
              </div>
              <div className="text-xs text-[#888888] mt-1">95% confidence interval</div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div>
        <h2 className="text-xs text-[#888888] uppercase tracking-wider mb-3">
          Confidence band
        </h2>
        <ConfidenceBandChart variants={variants} />
      </div>

      {/* Segment table */}
      <div>
        <h2 className="text-xs text-[#888888] uppercase tracking-wider mb-3">
          Segment breakdown
        </h2>
        <SegmentTable />
      </div>
    </div>
  );
}
