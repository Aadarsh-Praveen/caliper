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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded border border-red-700 bg-red-950 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-[#888888] text-xs uppercase tracking-wider">
            Experiment name
          </Label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Hero CTA Test"
            required
            className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE] placeholder:text-[#888888]"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[#888888] text-xs uppercase tracking-wider">
            Slug
          </Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="hero_cta_test"
            required
            pattern="^[a-z0-9_]+$"
            className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE] placeholder:text-[#888888] font-mono"
          />
          <p className="text-xs text-[#888888]">Lowercase letters, numbers, underscores only</p>
        </div>

        <div className="space-y-2">
          <Label className="text-[#888888] text-xs uppercase tracking-wider">
            Hypothesis
          </Label>
          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="We believe that changing the CTA button text will increase buy section views because..."
            rows={3}
            className="w-full rounded-md border border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F3EE] placeholder:text-[#888888] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#B8923A] resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[#888888] text-xs uppercase tracking-wider">
              Primary metric
            </Label>
            <Input
              value={primaryMetric}
              onChange={(e) => setPrimaryMetric(e.target.value)}
              placeholder="buy_section_view"
              required
              className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE] placeholder:text-[#888888] font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[#888888] text-xs uppercase tracking-wider">
              Metric type
            </Label>
            <Select
              value={metricType}
              onValueChange={(v) => setMetricType(v as "binary" | "continuous")}
            >
              <SelectTrigger className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A]">
                <SelectItem value="binary">Binary (conversion)</SelectItem>
                <SelectItem value="continuous">Continuous (revenue)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[#888888] text-xs uppercase tracking-wider">
              Baseline conversion rate (%)
            </Label>
            <Input
              type="number"
              value={baselineRate}
              onChange={(e) => setBaselineRate(e.target.value)}
              placeholder="4.0"
              min="0"
              max="100"
              step="0.1"
              className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE] placeholder:text-[#888888]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[#888888] text-xs uppercase tracking-wider">
              Minimum detectable effect (%)
            </Label>
            <Input
              type="number"
              value={mde}
              onChange={(e) => setMde(e.target.value)}
              placeholder="8.0"
              min="0"
              max="100"
              step="0.1"
              className="bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F3EE] placeholder:text-[#888888]"
            />
          </div>
        </div>

        <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-4">
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-3 font-medium">
            Variants (50 / 50 split)
          </p>
          <div className="flex gap-3">
            {["control", "treatment"].map((v) => (
              <div
                key={v}
                className="flex-1 rounded border border-[#2A2A2A] bg-[#0E0E0E] px-3 py-2 text-sm text-[#888888] font-mono"
              >
                {v} — 50%
              </div>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="bg-[#B8923A] text-[#0E0E0E] font-semibold hover:bg-[#a07d32] disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create experiment"}
        </Button>
      </form>

      <PowerCalculator
        baselineRate={isNaN(baselineDecimal) ? 0 : baselineDecimal}
        mde={isNaN(mdeDecimal) ? 0 : mdeDecimal}
      />
    </div>
  );
}
