"use client";

import { useState, useEffect } from "react";
import { caliper, hashVariant, type Variant } from "./sdk";
import { EXPERIMENTS } from "./experiments";

function getDisplayVariant(experimentId: string): Variant {
  if (typeof window === "undefined") return "control";
  const params = new URLSearchParams(window.location.search);
  const forceAll = params.get("caliper_force");
  if (forceAll === "control" || forceAll === "treatment") return forceAll;
  const forceSpecific = params.get(`caliper_force_${experimentId}`);
  if (forceSpecific === "control" || forceSpecific === "treatment") return forceSpecific;
  return hashVariant(caliper.getUserId(), experimentId);
}

function forceVariant(experimentId: string, variant: Variant) {
  const url = new URL(window.location.href);
  url.searchParams.delete("caliper_force");
  url.searchParams.set(`caliper_force_${experimentId}`, variant);
  window.location.href = url.toString();
}

function resetUser() {
  caliper.reset();
  const url = new URL(window.location.href);
  Array.from(url.searchParams.keys())
    .filter((k) => k.startsWith("caliper_force"))
    .forEach((k) => url.searchParams.delete(k));
  window.location.href = url.toString();
}

export default function CaliperDevPanel() {
  // Build-time guard — tree-shaken in production
  if (process.env.NODE_ENV !== "development") return null;

  const [collapsed, setCollapsed] = useState(false);
  const [userId, setUserId] = useState("...");
  const [variants, setVariants] = useState<Record<string, Variant>>({});

  useEffect(() => {
    setUserId(caliper.getUserId());
    const resolved: Record<string, Variant> = {};
    for (const experimentId of Object.values(EXPERIMENTS)) {
      resolved[experimentId] = getDisplayVariant(experimentId);
    }
    setVariants(resolved);
  }, []);

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999]" style={{ fontFamily: "ui-monospace, monospace" }}>
        <button
          onClick={() => setCollapsed(false)}
          className="bg-black/85 text-white text-[11px] px-3 py-2 rounded-lg border border-white/10 hover:bg-black transition-colors"
        >
          🧪 Caliper
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-72" style={{ fontFamily: "ui-monospace, monospace" }}>
      <div className="bg-black/90 text-white rounded-xl border border-white/10 backdrop-blur-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#E8C86A" }}>
            🧪 Caliper Dev
          </span>
          <button
            onClick={() => setCollapsed(true)}
            style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1 }}
            className="hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* User ID */}
        <div className="px-4 py-3 border-b border-white/10">
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
            USER ID
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
            {userId.slice(0, 8)}…
          </div>
        </div>

        {/* Experiments */}
        <div className="px-4 py-3 flex flex-col gap-4">
          {Object.values(EXPERIMENTS).map((experimentId) => {
            const v = variants[experimentId];
            return (
              <div key={experimentId}>
                <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                  {experimentId.toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: v === "treatment" ? "rgba(184,146,58,0.25)" : "rgba(255,255,255,0.08)",
                      color: v === "treatment" ? "#E8C86A" : "rgba(255,255,255,0.55)",
                    }}
                  >
                    {v ?? "…"}
                  </span>
                  <button
                    onClick={() => forceVariant(experimentId, "control")}
                    style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)" }}
                    className="hover:text-white hover:border-white/30 transition-colors"
                  >
                    ctrl
                  </button>
                  <button
                    onClick={() => forceVariant(experimentId, "treatment")}
                    style={{ fontSize: 10, color: "rgba(232,200,106,0.6)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(232,200,106,0.2)" }}
                    className="hover:text-[#E8C86A] hover:border-[#E8C86A]/50 transition-colors"
                  >
                    treat
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reset */}
        <div className="px-4 py-3 border-t border-white/10">
          <button
            onClick={resetUser}
            style={{ fontSize: 10, width: "100%", padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)", color: "rgba(248,113,113,0.6)" }}
            className="hover:text-red-400 hover:border-red-400/40 transition-colors"
          >
            Reset User ID
          </button>
        </div>
      </div>
    </div>
  );
}
