"use client";

import { useState, useEffect } from "react";
import { caliper, type Variant } from "./sdk";

export function useCaliperVariant(experimentId: string): {
  variant: Variant | null;
  isLoading: boolean;
} {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await caliper.assign(experimentId);
      if (cancelled) return;
      setVariant(resolved);
      void caliper.track("experiment_exposed", { experiment_id: experimentId, variant: resolved });
    })();
    return () => { cancelled = true; };
  }, [experimentId]);

  return { variant, isLoading: variant === null };
}
