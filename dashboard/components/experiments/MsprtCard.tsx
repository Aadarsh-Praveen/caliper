interface Props {
  msprtPValue: number;
  classicalPValue: number | null;
  shouldStop: boolean;
}

export function MsprtCard({ msprtPValue, classicalPValue, shouldStop }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
          Always-Valid Inference
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">mSPRT P-Value</span>
          <span className={`text-lg font-bold tabular-nums font-mono ${shouldStop ? "text-[#10b981]" : "text-slate-800"}`}>
            {msprtPValue.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Classical P-Value</span>
          <span className="text-lg font-semibold tabular-nums font-mono text-slate-400">
            {classicalPValue != null ? classicalPValue.toFixed(4) : "—"}
          </span>
        </div>

        <div className={`flex items-center gap-2 text-xs font-semibold pt-2 border-t border-slate-100 ${shouldStop ? "text-[#10b981]" : "text-amber-600"}`}>
          {shouldStop ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 6.5l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Safe to stop
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
              </svg>
              Continue collecting data
            </>
          )}
        </div>

        <p className="text-[10px] text-slate-300 leading-relaxed">
          Valid at any sample size — peek-proof (Johari, Pekelis, Walsh 2015).
        </p>
      </div>
    </div>
  );
}
