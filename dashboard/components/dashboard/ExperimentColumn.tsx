"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { LiftTrendChart } from "@/components/charts/LiftTrendChart";
import { ConversionRateChart } from "@/components/charts/ConversionRateChart";
import { ConversionFunnel } from "@/components/charts/ConversionFunnel";
import type { ExperimentComparisonItem } from "@/lib/types";

interface Props {
  experiment: ExperimentComparisonItem;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function ExperimentColumn({ experiment: exp }: Props) {
  const liftColor =
    exp.lift == null
      ? "text-[#727785]"
      : exp.lift > 0
      ? "text-emerald-600"
      : exp.lift < 0
      ? "text-red-600"
      : "text-[#727785]";

  return (
    <Link
      href={`/experiments/${exp.id}`}
      className="block bg-white border border-[#c2c6d6] rounded-xl overflow-hidden hover:border-[#0058be]/50 hover:shadow-md transition-all"
    >
      {/* Header */}
      <div className="p-5 border-b border-[#dde3f0]">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#0b1c30] leading-snug pr-2">{exp.name}</h3>
          <ArrowRight size={14} className="text-[#9ba8c0] shrink-0 mt-0.5" />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold uppercase tracking-wider">
            {exp.status}
          </span>
          {Boolean(exp.srm_flag) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold uppercase tracking-wider">
              <AlertTriangle size={9} />
              SRM
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${liftColor}`}>
            {exp.lift == null
              ? "—"
              : `${exp.lift > 0 ? "+" : ""}${(exp.lift * 100).toFixed(1)}%`}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#9ba8c0]">Lift</span>
        </div>
        <p className="text-[11px] text-[#9ba8c0] tabular-nums mt-1">
          {formatNumber(exp.n_total)} users assigned
        </p>
      </div>

      {/* Lift Trend */}
      <div className="px-4 pt-3 pb-2 border-b border-[#dde3f0]">
        <p className="text-[10px] uppercase tracking-widest text-[#9ba8c0] font-semibold mb-1">Lift Trend</p>
        <LiftTrendChart data={exp.daily_lift} compact />
      </div>

      {/* Conversion Rate */}
      <div className="px-4 pt-3 pb-2 border-b border-[#dde3f0]">
        <p className="text-[10px] uppercase tracking-widest text-[#9ba8c0] font-semibold mb-1">Conversion Rate</p>
        <ConversionRateChart data={exp.daily_lift} compact />
      </div>

      {/* Funnel */}
      <div className="px-4 pt-3 pb-2 border-b border-[#dde3f0]">
        <p className="text-[10px] uppercase tracking-widest text-[#9ba8c0] font-semibold mb-1">Funnel</p>
        <ConversionFunnel data={exp.funnel} compact />
      </div>

      {/* Stats row */}
      <div className="p-4 grid grid-cols-3 gap-3 bg-[#f8f9ff]">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-[#9ba8c0] mb-0.5">Classical p</p>
          <p className={`text-sm font-mono tabular-nums font-semibold ${
            exp.p_value != null && exp.p_value < 0.05 ? "text-emerald-600" : "text-[#0b1c30]"
          }`}>
            {exp.p_value != null ? exp.p_value.toFixed(4) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-[#9ba8c0] mb-0.5">Always-valid p</p>
          <p className="text-sm font-mono tabular-nums font-semibold text-[#0b1c30]">
            {exp.msprt_p_value != null ? exp.msprt_p_value.toFixed(4) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-[#9ba8c0] mb-0.5">CUPED</p>
          <p className="text-sm font-mono tabular-nums font-semibold text-[#0b1c30]">
            {exp.cuped_variance_reduction != null
              ? `${exp.cuped_variance_reduction.toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}
