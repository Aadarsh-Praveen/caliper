"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExperimentList } from "@/components/experiments/ExperimentList";
import type { Experiment } from "@/lib/types";

const DEMO_API_KEY = "caliper_demo_key_public";

interface ExperimentWithStats extends Experiment {
  sample_size?: number;
  p_value?: number | null;
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/experiments", {
      headers: { "X-API-Key": DEMO_API_KEY },
    })
      .then((r) => r.json())
      .then((data) => {
        setExperiments(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load experiments");
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F5F3EE]">Experiments</h1>
          <p className="text-sm text-[#888888] mt-1">
            {experiments.length} experiment{experiments.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        <Link href="/experiments/new">
          <Button className="bg-[#B8923A] text-[#0E0E0E] font-semibold hover:bg-[#a07d32]">
            Create experiment
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-12 text-center">
          <p className="text-[#888888] text-sm">Loading experiments...</p>
        </div>
      ) : (
        <ExperimentList experiments={experiments} />
      )}
    </div>
  );
}
