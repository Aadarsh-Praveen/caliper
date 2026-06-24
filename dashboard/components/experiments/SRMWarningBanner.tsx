interface Props {
  observed: Record<string, number>;
  expected: Record<string, number>;
}

export function SRMWarningBanner({ observed, expected }: Props) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-start gap-3.5 px-5 py-4">
        <div className="shrink-0 mt-0.5">
          <div className="w-7 h-7 rounded-full bg-red-100 border border-red-200 flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M6.5 2L11.5 11H1.5L6.5 2Z" stroke="#DC2626" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M6.5 5.5v2.5" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="6.5" cy="9.5" r="0.6" fill="#DC2626" />
            </svg>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-700 mb-1">
            Sample Ratio Mismatch detected
          </div>
          <p className="text-xs text-red-500 leading-relaxed mb-3">
            Do not trust these results until the underlying issue is resolved.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-red-200 bg-white px-3 py-2">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Observed</div>
              <div className="font-mono text-xs text-red-700">
                {Object.entries(observed).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-white px-3 py-2">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Expected</div>
              <div className="font-mono text-xs text-red-700">
                {Object.entries(expected).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
