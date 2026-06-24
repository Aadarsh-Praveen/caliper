"use client";

interface Props {
  baselineRate: number;
  mde: number;
  dailyVisitors?: number;
}

export function PowerCalculator({ baselineRate, mde, dailyVisitors = 2000 }: Props) {
  const p = baselineRate;
  const d = mde;

  let requiredN: number | null = null;
  let days: number | null = null;

  if (p > 0 && p < 1 && d > 0) {
    requiredN = Math.ceil((16 * p * (1 - p)) / (d * d));
    days = Math.ceil(requiredN / dailyVisitors);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden h-fit">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
          Power Calculator
        </span>
      </div>

      <div className="p-5 space-y-5">
        {requiredN !== null && days !== null ? (
          <>
            <div>
              <div className="text-3xl font-bold text-[#3b82f6] tabular-nums tracking-tight">
                {requiredN.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wider">
                users per variant
              </div>
            </div>

            <div>
              <div className="text-xl font-semibold text-slate-900 tabular-nums">
                ~{days} days
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                at {dailyVisitors.toLocaleString()} daily visitors / variant
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                With baseline {(baselineRate * 100).toFixed(1)}% and MDE{" "}
                {(mde * 100).toFixed(1)}%, you need ~{requiredN.toLocaleString()} users per variant
                — about {days} days at your traffic rate.
              </p>
            </div>
          </>
        ) : (
          <div className="py-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter a baseline conversion rate and minimum detectable effect to see the required
              sample size.
            </p>
          </div>
        )}

        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          {[
            { label: "Power", value: "80%" },
            { label: "Significance", value: "α = 0.05" },
            { label: "Test type", value: "two-sided z" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-slate-400">{label}</span>
              <span className="text-slate-700 font-mono tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
