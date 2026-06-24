"use client";

import type { VariantStats } from "@/lib/types";

interface Props {
  variants: VariantStats[];
}

export function ConfidenceBandChart({ variants }: Props) {
  const hasData = variants.some((v) => v.n > 0);

  if (!hasData) {
    return (
      <div className="py-8 text-center">
        <div className="flex justify-center mb-3">
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none" aria-hidden>
            <rect x="4" y="20" width="6" height="6" rx="1" fill="#E2E8F0" />
            <rect x="15" y="12" width="6" height="14" rx="1" fill="#E2E8F0" />
            <rect x="26" y="6" width="6" height="20" rx="1" fill="#E2E8F0" />
            <path d="M1 26h34" stroke="#CBD5E1" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-xs text-slate-400">
          Conversion rates will appear here once data has accumulated.
        </p>
      </div>
    );
  }

  const maxRate = Math.max(...variants.map((v) => v.conversion_rate), 0.001);
  const maxBarPx = 100;

  return (
    <div className="pl-12">
      <div className="relative" style={{ height: `${maxBarPx + 32}px` }}>
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            className="absolute left-0 right-0 flex items-center"
            style={{ bottom: `${(pct / 100) * maxBarPx + 24}px` }}
          >
            <span
              className="absolute right-full pr-3 text-[11px] text-[#424754] tabular-nums whitespace-nowrap font-semibold"
            >
              {((maxRate * pct) / 100 * 100).toFixed(1)}%
            </span>
            <div className="w-full h-px bg-slate-100" />
          </div>
        ))}

        <div className="absolute bottom-0 left-0 right-0 flex items-end gap-6 px-8" style={{ height: `${maxBarPx}px` }}>
          {variants.map((v) => {
            const isControl = v.name === "control";
            const barH = maxRate > 0 ? Math.max(4, (v.conversion_rate / maxRate) * maxBarPx) : 4;
            return (
              <div key={v.name} className="flex flex-col items-center gap-1.5 flex-1">
                <span className="text-[12px] text-[#0b1c30] font-mono tabular-nums font-semibold">
                  {(v.conversion_rate * 100).toFixed(2)}%
                </span>
                <div
                  className={`w-full rounded-t transition-all duration-500 ${isControl ? "bg-slate-200" : "bg-[#3b82f6]"}`}
                  style={{ height: `${barH}px` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6 px-8 mt-3 border-t border-slate-100 pt-3">
        {variants.map((v) => (
          <div key={v.name} className="flex-1 text-center">
            <div className="text-[13px] text-[#0b1c30] font-semibold">{v.name}</div>
            <div className="text-[11px] text-[#424754] tabular-nums mt-0.5">n = {v.n.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
