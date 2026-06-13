"use client";

import { useState, useEffect } from "react";
import { caliper, hashVariant, type Variant } from "./sdk";

function resolveVariant(experimentId: string): Variant {
  if (typeof window === "undefined") return "control";

  const params = new URLSearchParams(window.location.search);

  if (process.env.NODE_ENV !== "production") {
    const forceAll = params.get("caliper_force");
    if (forceAll === "control" || forceAll === "treatment") return forceAll;

    const forceSpecific = params.get(`caliper_force_${experimentId}`);
    if (forceSpecific === "control" || forceSpecific === "treatment") return forceSpecific;
  }

  return hashVariant(caliper.getUserId(), experimentId);
}

export function useCaliperVariant(experimentId: string): {
  variant: Variant | null;
  isLoading: boolean;
} {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    const resolved = resolveVariant(experimentId);
    setVariant(resolved);
    void caliper.track("experiment_exposed", { experiment_id: experimentId, variant: resolved });
  }, [experimentId]);

  return { variant, isLoading: variant === null };
}
