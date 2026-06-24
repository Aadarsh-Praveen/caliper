"use client";

import { useState } from "react";
import type { Readout } from "@/lib/types";

interface Props {
  experimentId: string;
  initialReadout: Readout | null;
  apiKey: string;
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; dotColor: string }> = {
  treatment_wins:            { label: "Treatment Wins",     color: "text-green-700",  border: "border-green-200",  bg: "bg-green-50",   dotColor: "bg-green-500" },
  control_wins:              { label: "Control Wins",       color: "text-blue-700",   border: "border-blue-200",   bg: "bg-blue-50",    dotColor: "bg-blue-500"  },
  no_significant_difference: { label: "No Difference",     color: "text-slate-700",  border: "border-slate-200",  bg: "bg-slate-50",   dotColor: "bg-slate-400" },
  srm_invalidated:           { label: "Invalid (SRM)",     color: "text-red-700",    border: "border-red-200",    bg: "bg-red-50",     dotColor: "bg-red-500"   },
  insufficient_data:         { label: "Insufficient Data", color: "text-amber-700",  border: "border-amber-200",  bg: "bg-amber-50",   dotColor: "bg-amber-500" },
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AI Readout</span>
            <span className="text-[9px] bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-medium">
              Bedrock · Haiku 4.5
            </span>
          </div>
          <button
            onClick={regenerate}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-md bg-[#3b82f6] text-white font-semibold hover:bg-[#2563eb] disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="animate-spin" aria-hidden>
                  <circle cx="4.5" cy="4.5" r="3" stroke="white" strokeWidth="1.5" opacity="0.3" />
                  <path d="M4.5 1.5A3 3 0 0 1 7.5 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Generating…
              </span>
            ) : "Generate"}
          </button>
        </div>
        <div className="px-4 py-4">
          {error
            ? <p className="text-xs text-red-500">{error}</p>
            : <p className="text-xs text-slate-400 leading-relaxed">Get a plain-English summary powered by Amazon Bedrock and Claude Haiku 4.5.</p>
          }
        </div>
      </div>
    );
  }

  const verdict = VERDICT_CONFIG[readout.verdict] ?? VERDICT_CONFIG.no_significant_difference;

  return (
    <div className={`rounded-xl border overflow-hidden shadow-sm ${verdict.border} ${verdict.bg}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${verdict.border}`}>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${verdict.dotColor}`} />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AI Readout</span>
          <span className="text-[9px] bg-white text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-medium">
            Bedrock · Haiku 4.5
          </span>
        </div>
        <button
          onClick={regenerate}
          disabled={loading}
          className="text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-800 disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "↺"}
        </button>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className={`text-sm font-bold ${verdict.color}`}>{verdict.label}</div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          {CONFIDENCE_LABELS[readout.confidence] ?? readout.confidence} · {new Date(readout.generated_at).toLocaleDateString()}
        </div>
      </div>

      <div className="px-4 pb-4 mt-2 space-y-2.5">
        <p className="text-xs text-slate-800 leading-relaxed">{readout.summary}</p>
        <div className="border-t border-slate-200/70 pt-2.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Recommendation</span>
          <p className="text-xs text-[#3b82f6] font-medium leading-relaxed mt-1">{readout.recommendation}</p>
        </div>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
    </div>
  );
}
