"use client";

import { useState } from "react";
import type { Readout } from "@/lib/types";

interface Props {
  experimentId: string;
  initialReadout: Readout | null;
  apiKey: string;
}

const VERDICT_LABELS: Record<string, { text: string; color: string }> = {
  treatment_wins: { text: "Treatment Wins", color: "text-emerald-400" },
  control_wins: { text: "Control Wins", color: "text-emerald-400" },
  no_significant_difference: { text: "No Significant Difference", color: "text-zinc-400" },
  srm_invalidated: { text: "Results Invalid (SRM)", color: "text-red-400" },
  insufficient_data: { text: "Insufficient Data", color: "text-yellow-400" },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ReadoutCard({ experimentId, initialReadout, apiKey }: Props) {
  const [readout, setReadout] = useState<Readout | null>(initialReadout);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/readout`, {
        method: "POST",
        headers: { "X-API-Key": apiKey },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReadout(data.readout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate readout");
    } finally {
      setLoading(false);
    }
  };

  if (!readout) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">AI Readout</h3>
          <button
            onClick={regenerate}
            disabled={loading}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate readout"}
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          {error ||
            "Click 'Generate readout' to get a plain-English summary of this experiment, powered by Amazon Bedrock and Claude Haiku 4.5."}
        </p>
      </div>
    );
  }

  const verdict = VERDICT_LABELS[readout.verdict] ?? { text: readout.verdict, color: "text-zinc-400" };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">AI Readout</div>
          <h3 className={`text-lg font-semibold ${verdict.color}`}>{verdict.text}</h3>
          <div className="text-xs text-zinc-500 mt-1">
            {CONFIDENCE_LABELS[readout.confidence] ?? readout.confidence} &middot;{" "}
            Generated {new Date(readout.generated_at).toLocaleString()}
          </div>
        </div>
        <button
          onClick={regenerate}
          disabled={loading}
          className="text-xs px-3 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 disabled:opacity-50"
        >
          {loading ? "..." : "Regenerate"}
        </button>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed mb-3">{readout.summary}</p>
      <p className="text-sm text-amber-400">
        <span className="text-zinc-500">Recommendation: </span>
        {readout.recommendation}
      </p>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
