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
  if (!control || !treatment) return "text-slate-300";
  const diff = treatment.conversion_rate - control.conversion_rate;
  if (Math.abs(diff) < 0.001) return "text-slate-400";
  return diff > 0 ? "text-green-600" : "text-red-500";
}

export function SegmentTable({ segments }: { segments: SegmentRow[] }) {
  if (!segments || segments.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-slate-400">
          Segment analysis pending — dbt runs every 15 minutes.
        </p>
      </div>
    );
  }

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
    <div className="space-y-4">
      {Array.from(byDimension.entries()).map(([dimension, byValue]) => (
        <div key={dimension} className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
              {dimension}
            </span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="text-left px-4 py-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Segment</th>
                <th className="text-right px-4 py-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Control</th>
                <th className="text-right px-4 py-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Treatment</th>
                <th className="text-right px-4 py-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Lift</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byValue.entries()).map(([value, { control, treatment }]) => (
                <tr key={value} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-800 font-mono font-medium">{value}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 font-mono tabular-nums">
                    {control ? (
                      <>
                        <span className="text-slate-800">{control.n.toLocaleString()}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        {formatPct(control.conversion_rate)}
                      </>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 font-mono tabular-nums">
                    {treatment ? (
                      <>
                        <span className="text-slate-800">{treatment.n.toLocaleString()}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        {formatPct(treatment.conversion_rate)}
                      </>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${liftColor(control, treatment)}`}>
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
