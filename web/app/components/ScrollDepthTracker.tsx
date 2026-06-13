"use client";

import { useScrollDepth } from "@/lib/caliper/useScrollDepth";

export default function ScrollDepthTracker() {
  useScrollDepth();
  return null;
}
