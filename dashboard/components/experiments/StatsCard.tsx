import type { VariantStats } from "@/lib/types";

interface Props {
  stat: VariantStats;
  isControl?: boolean;
}

function formatPct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

export function StatsCard({ stat, isControl }: Props) {
  return (
    <div className={`flex-1 rounded-xl border bg-white p-5 shadow-sm ${isControl ? "border-slate-200" : "border-[#3b82f6]/25"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {stat.name}
        </span>
        {isControl ? (
          <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-semibold tracking-wide">
            control
          </span>
        ) : (
          <span className="text-[10px] bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-2 py-0.5 rounded-full font-semibold tracking-wide">
            treatment
          </span>
        )}
      </div>

      {/* Sample size */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-[#1e293b] tracking-tight tabular-nums">
          {stat.n.toLocaleString()}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wider">users</div>
      </div>

      <div className="border-t border-slate-100 mb-4" />

      {/* Conversion rate */}
      <div>
        <div className={`text-2xl font-semibold tabular-nums ${!isControl ? "text-[#3b82f6]" : "text-slate-800"}`}>
          {formatPct(stat.conversion_rate)}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wider">
          conversion rate
        </div>
      </div>

      {/* Conversion count */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-400 tabular-nums">
          {stat.conversions.toLocaleString()}{" "}
          <span className="text-slate-300">conversions</span>
        </span>
      </div>
    </div>
  );
}
