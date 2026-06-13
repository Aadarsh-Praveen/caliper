"use client";

import { useEffect } from "react";
import { caliper } from "./sdk";

export function useScrollDepth(): void {
  useEffect(() => {
    const fired = new Set<number>();
    const thresholds = [25, 50, 75, 100] as const;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = (scrollTop / docHeight) * 100;
      for (const t of thresholds) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          void caliper.track("scroll_depth", { depth: t });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
}
