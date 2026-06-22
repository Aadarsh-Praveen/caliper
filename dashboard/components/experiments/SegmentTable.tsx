import type { SegmentRow } from "@/lib/types";

interface SegmentGroup {
  control: SegmentRow | undefined;
  treatment: SegmentRow | undefined;
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function formatLift(control: SegmentRow | undefined, treatment: SegmentRow | undefined): string {
  if (!control || !treatment) return "—";
  const diff = treatment.conversion_rate - control.conversion_rate;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${(diff * 100).toFixed(1)}pp`;
}

function liftColor(control: SegmentRow | undefined, treatment: SegmentRow | undefined): string {
  if (!control || !treatment) return "text-[#888888]";
  const diff = treatment.conversion_rate - control.conversion_rate;
  if (Math.abs(diff) < 0.001) return "text-[#888888]";
  return diff > 0 ? "text-green-400" : "text-red-400";
}

export function SegmentTable({ segments }: { segments: SegmentRow[] }) {
  if (!segments || segments.length === 0) {
    return (
      <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-6 text-center">
        <p className="text-sm text-[#888888]">
          Segment analysis pending — dbt runs every 15 minutes.
        </p>
      </div>
    );
  }

  // Group by dimension, then by segment_value → { control, treatment }
  const byDimension = new Map<string, Map<string, SegmentGroup>>();

  for (const row of segments) {
    if (!byDimension.has(row.segment_dimension)) {
      byDimension.set(row.segment_dimension, new Map());
    }
    const byValue = byDimension.get(row.segment_dimension)!;
    if (!byValue.has(row.segment_value)) {
      byValue.set(row.segment_value, { control: undefined, treatment: undefined });
    }
    const group = byValue.get(row.segment_value)!;
    if (row.variant === "control") group.control = row;
    else group.treatment = row;
  }

  return (
    <div className="space-y-6">
      {Array.from(byDimension.entries()).map(([dimension, byValue]) => (
        <div key={dimension} className="rounded border border-[#2A2A2A] bg-[#1A1A1A]">
          <div className="px-5 py-3 border-b border-[#2A2A2A]">
            <span className="text-xs text-[#888888] uppercase tracking-wider">{dimension}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-left px-5 py-2 text-xs text-[#888888] font-normal">Value</th>
                <th className="text-right px-5 py-2 text-xs text-[#888888] font-normal">Control (n, rate)</th>
                <th className="text-right px-5 py-2 text-xs text-[#888888] font-normal">Treatment (n, rate)</th>
                <th className="text-right px-5 py-2 text-xs text-[#888888] font-normal">Lift</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byValue.entries()).map(([value, { control, treatment }]) => (
                <tr key={value} className="border-b border-[#1E1E1E] last:border-0">
                  <td className="px-5 py-2 text-[#F5F3EE] font-mono">{value}</td>
                  <td className="px-5 py-2 text-right text-[#888888] font-mono">
                    {control ? `${control.n.toLocaleString()}, ${formatPct(control.conversion_rate)}` : "—"}
                  </td>
                  <td className="px-5 py-2 text-right text-[#888888] font-mono">
                    {treatment ? `${treatment.n.toLocaleString()}, ${formatPct(treatment.conversion_rate)}` : "—"}
                  </td>
                  <td className={`px-5 py-2 text-right font-mono font-semibold ${liftColor(control, treatment)}`}>
                    {formatLift(control, treatment)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
