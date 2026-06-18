"use client";

import type { VariantStats } from "@/lib/types";

interface Props {
  variants: VariantStats[];
}

export function ConfidenceBandChart({ variants }: Props) {
  const hasData = variants.some((v) => v.n > 0);

  if (!hasData) {
    return (
      <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-8 text-center">
        <p className="text-sm text-[#888888]">
          Confidence band visualization will appear here once data has accumulated.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-6">
      <h3 className="text-sm font-medium text-[#888888] uppercase tracking-wider mb-4">
        Conversion Rates
      </h3>
      <div className="flex items-end gap-6 h-24">
        {variants.map((v) => (
          <div key={v.name} className="flex flex-col items-center gap-2 flex-1">
            <div className="text-xs text-[#F5F3EE] font-mono">
              {(v.conversion_rate * 100).toFixed(1)}%
            </div>
            <div
              className="w-full rounded-t bg-[#B8923A] opacity-80 transition-all"
              style={{
                height: `${Math.max(4, v.conversion_rate * 200)}px`,
              }}
            />
            <div className="text-xs text-[#888888]">{v.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
