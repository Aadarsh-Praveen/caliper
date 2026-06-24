"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const FEATURES = [
  { title: "Custom Alpha levels.", desc: "Tune your significance thresholds per experiment." },
  { title: "CUPED variance reduction.", desc: "Pre-experiment covariate adjustment for tighter confidence intervals." },
  { title: "mSPRT sequential testing.", desc: "Always-valid inference — peek without inflating false positive rates." },
  { title: "AI-powered readouts.", desc: "Claude Haiku 4.5 on Amazon Bedrock summarises results in plain English." },
];

export default function LandingPage() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (!navRef.current) return;
      if (window.scrollY > 16) {
        navRef.current.style.backgroundColor = "rgba(255,255,255,0.92)";
        navRef.current.style.backdropFilter = "blur(12px)";
        navRef.current.style.boxShadow = "0 1px 0 #e2e8f0, 0 4px 16px rgba(0,0,0,0.04)";
      } else {
        navRef.current.style.backgroundColor = "#ffffff";
        navRef.current.style.backdropFilter = "none";
        navRef.current.style.boxShadow = "none";
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] antialiased overflow-x-hidden">

      {/* ── Nav ── */}
      <nav
        ref={navRef}
        className="fixed top-0 w-full z-50 bg-white border-b border-[#e2e8f0] h-16 flex items-center transition-all duration-200 ease-in-out"
      >
        <div className="max-w-7xl mx-auto px-6 w-full flex justify-between items-center">
          <span className="text-[15px] font-bold tracking-widest text-[#1e293b]">CALIPER</span>
          <Link
            href="/dashboard"
            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-sm shadow-blue-500/20"
          >
            Dashboard →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main className="pt-32 pb-20 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

            {/* Left */}
            <div className="lg:col-span-6 space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f8fafc] border border-[#e2e8f0]">
                <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[#059669]">
                  B2B Experimentation Platform
                </span>
              </div>

              <h1 className="text-[40px] md:text-[56px] leading-[1.1] font-extrabold tracking-tight text-[#1e293b]">
                Statistical rigor <br />
                <span className="text-[#3b82f6]">without the price tag.</span>
              </h1>

              <p className="text-[16px] leading-relaxed text-[#64748b] max-w-lg">
                Run A/B experiments with confidence. Caliper gives you two-proportion z-tests,
                sticky bucketing, live p-values, and SRM detection — all in one lightweight
                platform built for teams that care about getting it right.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/dashboard"
                  className="bg-[#3b82f6] hover:bg-[#2563eb] text-white px-8 py-3.5 rounded-lg font-semibold text-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  Try the demo
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                    <path d="M3.75 9h10.5M9.75 4.5 14.25 9l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-[#e2e8f0]">
                {[
                  { value: "cyrb53", label: "Sticky bucketing" },
                  { value: "z-test", label: "Statistical test" },
                  { value: "95%",    label: "CI level" },
                ].map(({ value, label }) => (
                  <div key={label}>
                    <div className="text-[18px] font-bold text-[#1e293b]">{value}</div>
                    <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — dashboard preview card */}
            <div className="lg:col-span-6">
              <div
                className="bg-white border border-[#e2e8f0] rounded-xl p-4 overflow-hidden"
                style={{ boxShadow: "0 4px 24px rgba(59,130,246,0.10), 0 20px 60px rgba(0,0,0,0.07)" }}
              >
                {/* Window chrome */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#e2e8f0]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#dc2626]" />
                    <div className="w-3 h-3 rounded-full bg-[#059669]" />
                    <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                  </div>
                  <div className="font-mono text-[12px] text-[#64748b]">Exp: conversion_v2_checkout</div>
                </div>

                {/* Mock bar chart */}
                <div className="bg-[#f8fafc] rounded-lg border border-[#e2e8f0] px-5 pt-4 pb-3 mb-4">
                  {/* Bars */}
                  <div className="flex items-end gap-3 h-28">
                    {[
                      { label: "Variant A", value: "+12.4%", barH: 72, color: "#3b82f6" },
                      { label: "Variant B", value: "+24.1%", barH: 100, color: "#6366f1" },
                      { label: "Control",   value: "Base",   barH: 52,  color: "#cbd5e1" },
                    ].map(({ label, value, barH, color }) => (
                      <div key={label} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[9px] font-mono font-bold" style={{ color }}>{value}</span>
                        <div className="w-full rounded-t" style={{ height: barH, backgroundColor: color }} />
                      </div>
                    ))}
                  </div>
                  {/* X-axis labels */}
                  <div className="flex gap-3 border-t border-[#e2e8f0] pt-2 mt-1">
                    {["Variant A", "Variant B", "Control"].map((l) => (
                      <div key={l} className="flex-1 text-center text-[9px] text-[#94a3b8] font-medium">{l}</div>
                    ))}
                  </div>
                </div>

                {/* Mini stat cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                    <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">P-Value</div>
                    <div className="font-mono text-[#10b981] font-bold text-sm">
                      0.0034 <span className="text-[10px] opacity-70">(Significant)</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                    <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">Power</div>
                    <div className="font-mono text-[#1e293b] font-bold text-sm">84.2%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Bento Feature Grid ── */}
      <section className="py-24 bg-white border-y border-[#e2e8f0]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 text-center max-w-2xl mx-auto">
            <h2 className="text-[32px] font-bold tracking-tight text-[#1e293b] mb-4">
              Precision-engineered features
            </h2>
            <p className="text-[16px] text-[#64748b] leading-relaxed">
              Enterprise-grade statistical tools designed for high-performance product teams who demand accuracy over flashiness.
            </p>
          </div>

          <div className="grid grid-cols-12 gap-6">

            {/* Large: z-tests */}
            <div className="col-span-12 lg:col-span-8 bg-white border border-[#e2e8f0] rounded-xl p-8 hover:border-blue-200 transition-all shadow-sm">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4">
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
                    <rect x="4"  y="20" width="6" height="12" rx="1.5" fill="#3b82f6" opacity="0.35" />
                    <rect x="15" y="12" width="6" height="20" rx="1.5" fill="#3b82f6" opacity="0.65" />
                    <rect x="26" y="5"  width="6" height="27" rx="1.5" fill="#3b82f6" />
                  </svg>
                  <h3 className="text-[20px] font-bold text-[#1e293b]">Two-proportion z-tests</h3>
                  <p className="text-[#64748b] text-sm leading-relaxed">
                    Utilize rigorous frequentist statistics to compare conversion rates. Our engine handles large sample sizes with extreme precision, ensuring your decisions are backed by hard data.
                  </p>
                </div>
                <div className="flex-1 w-full bg-[#f1f5f9] rounded-lg p-5 border border-[#e2e8f0] font-mono text-xs leading-relaxed">
                  <div className="text-[#10b981] mb-2 opacity-80">{"// Statistical validation"}</div>
                  <div className="text-[#1e293b] space-y-0.5">
                    <div><span className="text-[#6366f1]">const</span> zScore = (p1 - p2) /</div>
                    <div className="pl-4">Math.sqrt(p * (1-p) * (1/n1 + 1/n2));</div>
                    <div><span className="text-[#6366f1]">return</span> stats.pFromZ(zScore);</div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#e2e8f0] space-y-0.5">
                    <div className="text-[#64748b]">P-Value Output: 0.0421</div>
                    <div className="text-[#10b981] font-bold">Status: CI(95%) Cleared ✓</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Small: Sticky bucketing */}
            <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-white border border-[#e2e8f0] rounded-xl p-8 hover:border-indigo-200 transition-all shadow-sm">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-6" aria-hidden>
                <circle cx="18" cy="11" r="6" fill="#6366f1" opacity="0.25" />
                <circle cx="18" cy="11" r="6" stroke="#6366f1" strokeWidth="1.5" fill="none" />
                <path d="M8 30c0-5.5 4.5-9 10-9s10 3.5 10 9" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M27 6a5 5 0 0 1 0 10" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" fill="none" />
              </svg>
              <h3 className="text-[18px] font-bold text-[#1e293b] mb-2">Sticky bucketing</h3>
              <p className="text-[#64748b] text-sm leading-relaxed">
                Consistent user experience across sessions using the high-performance cyrb53 hashing algorithm. No flickering, no bias, just reliable assignment.
              </p>
            </div>

            {/* Small: Live p-values */}
            <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-white border border-[#e2e8f0] rounded-xl p-8 hover:border-emerald-200 transition-all shadow-sm">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-6" aria-hidden>
                <polyline points="3,26 9,18 15,22 22,12 29,17 33,9" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="33" cy="9" r="3" fill="#10b981" />
              </svg>
              <h3 className="text-[18px] font-bold text-[#1e293b] mb-2">Live p-values</h3>
              <p className="text-[#64748b] text-sm leading-relaxed">
                Real-time calculations that update as events stream in. Monitor significance thresholds as they approach without waiting for batch jobs to finish.
              </p>
            </div>

            {/* Large: SRM detection */}
            <div className="col-span-12 lg:col-span-8 bg-white border border-[#e2e8f0] rounded-xl p-8 hover:border-red-200 transition-all shadow-sm">
              <div className="flex flex-col md:flex-row-reverse gap-8 items-center">
                <div className="flex-1 space-y-4">
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
                    <path d="M18 4 L33 30 H3 Z" fill="#dc2626" opacity="0.12" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" />
                    <line x1="18" y1="14" x2="18" y2="23" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="18" cy="27" r="1.5" fill="#dc2626" />
                  </svg>
                  <h3 className="text-[20px] font-bold text-[#1e293b]">SRM detection</h3>
                  <p className="text-[#64748b] text-sm leading-relaxed">
                    Sample Ratio Mismatch alerts you immediately if your experiment traffic is unevenly distributed, preventing invalid conclusions before they cost you revenue.
                  </p>
                </div>
                <div className="flex-1 w-full bg-[#f1f5f9] rounded-lg p-6 border border-[#e2e8f0] flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                      <circle cx="64" cy="64" r="50" fill="transparent" stroke="#e2e8f0" strokeWidth="10" />
                      <circle cx="64" cy="64" r="50" fill="transparent" stroke="#dc2626" strokeWidth="10"
                        strokeDasharray="314" strokeDashoffset="180" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-[#dc2626] font-bold text-sm">SRM</span>
                      <span className="text-[9px] text-[#64748b] uppercase tracking-wide mt-0.5">Mismatched</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Engineered for Data Teams ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-12 relative overflow-hidden shadow-lg">
            {/* Decorative bg chart */}
            <div className="absolute top-0 right-0 h-full flex items-center pr-8 opacity-[0.04] pointer-events-none select-none" aria-hidden>
              <svg width="240" height="240" viewBox="0 0 36 36" fill="none">
                <polyline points="3,26 9,18 15,22 22,12 29,17 33,9" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="max-w-xl relative z-10">
              <h2 className="text-[32px] font-bold tracking-tight text-[#1e293b] mb-6">
                Engineered for Data Teams
              </h2>
              <p className="text-[16px] text-[#64748b] leading-relaxed mb-8">
                Stop relying on black-box tools. Caliper provides full transparency into the math.
                Export your data, audit the methodology, and scale with confidence.
              </p>

              <ul className="space-y-4 mb-10">
                {FEATURES.map(({ title, desc }) => (
                  <li key={title} className="flex items-start gap-3">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#3b82f6] mt-0.5 shrink-0" aria-hidden>
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M6.5 10l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div>
                      <span className="font-semibold text-[#1e293b] text-sm">{title}</span>
                      <p className="text-[#64748b] text-sm mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>

            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-[#e2e8f0] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-1.5">
            <span className="text-[15px] font-bold tracking-widest text-[#1e293b]">CALIPER</span>
            <p className="text-[#64748b] text-sm">© 2024 Caliper Statistical Systems. All rights reserved.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-8">
            {["Privacy Policy", "Terms of Service", "Security", "Status"].map((l) => (
              <a key={l} href="#" className="text-sm text-[#64748b] hover:text-[#1e293b] transition-colors">{l}</a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[#64748b] text-sm">Built for AWS H0 Hackathon</span>
            <a
              href="https://github.com"
              className="text-[#1e293b] hover:text-[#3b82f6] transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
