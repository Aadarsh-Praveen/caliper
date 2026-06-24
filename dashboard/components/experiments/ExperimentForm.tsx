"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PowerCalculator } from "./PowerCalculator";

const DEMO_API_KEY = "caliper_demo_key_public";

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function ExperimentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [primaryMetric, setPrimaryMetric] = useState("");
  const [metricType, setMetricType] = useState<"binary" | "continuous">("binary");
  const [baselineRate, setBaselineRate] = useState("");
  const [mde, setMde] = useState("");

  const baselineDecimal = parseFloat(baselineRate) / 100;
  const mdeDecimal = parseFloat(mde) / 100;

  function handleNameChange(v: string) {
    setName(v);
    if (!slug) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": DEMO_API_KEY,
        },
        body: JSON.stringify({
          name,
          slug,
          hypothesis: hypothesis || undefined,
          primary_metric: primaryMetric,
          metric_type: metricType,
          variants: [
            { name: "control", allocation: 0.5 },
            { name: "treatment", allocation: 0.5 },
          ],
          baseline_conversion_rate: isNaN(baselineDecimal) ? undefined : baselineDecimal,
          minimum_detectable_effect: isNaN(mdeDecimal) ? undefined : mdeDecimal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create experiment");
        return;
      }

      router.push(`/experiments/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "bg-white border-slate-200 text-[#1e293b] placeholder:text-slate-300 focus-visible:ring-[#3b82f6]/30 focus-visible:border-[#3b82f6]/60 transition-colors text-sm h-9 shadow-none";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
      <form onSubmit={handleSubmit} className="space-y-0">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-600 flex items-center gap-2 mb-6">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 4.5v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* Section: Identity */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Identity
            </span>
          </div>
          <div className="p-5 space-y-5">
            <FieldGroup label="Experiment name">
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Hero CTA Test"
                required
                className={inputClass}
              />
            </FieldGroup>

            <FieldGroup label="Slug" hint="Lowercase letters, numbers, and underscores only">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="hero_cta_test"
                required
                pattern="^[a-z0-9_]+$"
                className={`${inputClass} font-mono`}
              />
            </FieldGroup>

            <FieldGroup label="Hypothesis">
              <textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="We believe that changing the CTA button text will increase buy section views because…"
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 resize-none bg-white text-[#1e293b] placeholder:text-slate-300 focus:ring-[#3b82f6]/30 focus:border-[#3b82f6]/60 transition-colors"
              />
            </FieldGroup>
          </div>
        </div>

        {/* Section: Metrics */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Metrics
            </span>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Primary metric">
                <Input
                  value={primaryMetric}
                  onChange={(e) => setPrimaryMetric(e.target.value)}
                  placeholder="buy_section_view"
                  required
                  className={`${inputClass} font-mono`}
                />
              </FieldGroup>
              <FieldGroup label="Metric type">
                <Select value={metricType} onValueChange={(v) => setMetricType(v as "binary" | "continuous")}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-[#1e293b] shadow-md">
                    <SelectItem value="binary" className="text-sm focus:bg-slate-50">
                      Binary (conversion)
                    </SelectItem>
                    <SelectItem value="continuous" className="text-sm focus:bg-slate-50">
                      Continuous (revenue)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Baseline rate (%)">
                <Input
                  type="number"
                  value={baselineRate}
                  onChange={(e) => setBaselineRate(e.target.value)}
                  placeholder="4.0"
                  min="0"
                  max="100"
                  step="0.1"
                  className={inputClass}
                />
              </FieldGroup>
              <FieldGroup label="Min. detectable effect (%)">
                <Input
                  type="number"
                  value={mde}
                  onChange={(e) => setMde(e.target.value)}
                  placeholder="8.0"
                  min="0"
                  max="100"
                  step="0.1"
                  className={inputClass}
                />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* Section: Variants */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Variants — 50 / 50 split
            </span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3">
              {["control", "treatment"].map((v, i) => (
                <div
                  key={v}
                  className={`flex items-center justify-between rounded-lg border px-3.5 py-3
                    ${i === 0
                      ? "border-slate-200 bg-slate-50"
                      : "border-[#3b82f6]/25 bg-[#3b82f6]/[0.03]"
                    }`}
                >
                  <span className="text-sm font-mono text-slate-800 font-medium">{v}</span>
                  <span className={`text-xs font-bold ${i === 0 ? "text-slate-400" : "text-[#3b82f6]"}`}>
                    50%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="bg-[#3b82f6] text-white font-semibold text-sm hover:bg-[#2563eb] disabled:opacity-40 transition-all h-9 px-6 rounded-lg shadow-sm"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin" aria-hidden>
                <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.5" opacity="0.3" />
                <path d="M6 1.5A4.5 4.5 0 0 1 10.5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Creating…
            </span>
          ) : (
            "Create experiment"
          )}
        </Button>
      </form>

      <PowerCalculator
        baselineRate={isNaN(baselineDecimal) ? 0 : baselineDecimal}
        mde={isNaN(mdeDecimal) ? 0 : mdeDecimal}
      />
    </div>
  );
}
