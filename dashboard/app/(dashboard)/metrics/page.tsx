import { headers } from "next/headers";
import Link from "next/link";
import {
  MousePointerClick, Eye, Activity, ArrowRight,
} from "lucide-react";
import type { MetricsPageData, MetricRegistryItem, MetricsDailyVolume, MetricsTaxonomyRow } from "@/lib/types";

const DEMO_API_KEY = "caliper_demo_key_public";

// Bar chart height in pixels — must match the container height set below
const CHART_H = 200;

async function fetchMetricsData(): Promise<MetricsPageData | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const res = await fetch(`${protocol}://${host}/api/metrics`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Failed to fetch metrics:", await res.text());
    return null;
  }
  return res.json();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function metricIcon(eventName: string) {
  if (eventName.includes("cart") || eventName.includes("buy") || eventName.includes("click")) return MousePointerClick;
  if (eventName.includes("view")) return Eye;
  return Activity;
}

const TYPE_BADGE: Record<string, string> = {
  Primary:    "bg-[#0058be]/[0.08] text-[#0058be]",
  Pageview:   "bg-emerald-50 text-emerald-700",
  Engagement: "bg-amber-50 text-amber-700",
  System:     "bg-zinc-100 text-zinc-600",
  Custom:     "bg-purple-50 text-purple-700",
};

// Color palette — one color per primary metric
const PALETTE = ["#0058be", "#7c3aed", "#059669"];

export default async function MetricsPage() {
  const data = await fetchMetricsData();

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          Failed to load metrics data. Please refresh the page.
        </div>
      </div>
    );
  }

  const { registry, daily_volume, taxonomy } = data;

  // ── Chart data assembly ──────────────────────────────────────
  const days = Array.from(new Set(daily_volume.map((d: MetricsDailyVolume) => d.day))).sort() as string[];
  const metricNames = Array.from(new Set(daily_volume.map((d: MetricsDailyVolume) => d.event_name))) as string[];
  const metricColors: Record<string, string> = {};
  metricNames.forEach((m, i) => { metricColors[m] = PALETTE[i % PALETTE.length]; });

  const chartRows = days.map((day) => {
    const segments = metricNames.map((m) => ({
      metric: m,
      count: daily_volume.find((d: MetricsDailyVolume) => d.day === day && d.event_name === m)?.count ?? 0,
    }));
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    return { day, segments, total };
  });

  const maxTotal = Math.max(...chartRows.map((r) => r.total), 1);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-bold text-[#0b1c30] tracking-tight mb-1">Metrics</h1>
        <p className="text-[#424754] text-sm">
          Event-level data flowing through your Caliper SDK — what&apos;s tracked, how much, and how often.
        </p>
      </div>

      {/* ── Metric Registry ────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#0b1c30]">Metric Registry</h2>
          <p className="text-xs text-[#727785]">Primary metrics tracked by your active experiments · Last 7 days</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(registry as MetricRegistryItem[]).map((item, idx) => {
            const Icon = metricIcon(item.event_name);
            const color = PALETTE[idx % PALETTE.length];
            return (
              <div
                key={item.event_name}
                className="bg-white border border-[#dde3f0] rounded-xl p-5 hover:border-[#0058be]/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-[#eff4ff]">
                    <Icon size={17} style={{ color }} />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#0058be] text-[10px] font-bold uppercase tracking-wider">
                    {item.metric_type}
                  </span>
                </div>

                <h3 className="font-mono text-sm font-semibold text-[#0b1c30] mb-1">{item.event_name}</h3>
                <p className="text-xs text-[#727785] mb-4">
                  Used in {item.experiments.length} experiment{item.experiments.length !== 1 ? "s" : ""}
                </p>

                <div className="space-y-2 pt-3 border-t border-[#dde3f0]/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Events (7d)</span>
                    <span className="text-sm font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(item.total_events_7d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Unique users</span>
                    <span className="text-sm font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(item.unique_users_7d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#727785]">Conversion rate</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                      {item.avg_conversion_rate != null
                        ? `${(item.avg_conversion_rate * 100).toFixed(2)}%`
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#dde3f0]/70">
                  {item.experiments.map((exp) => (
                    <Link
                      key={exp.id}
                      href={`/experiments/${exp.id}`}
                      className="flex items-center justify-between py-1 text-xs text-[#0058be] hover:underline"
                    >
                      <span className="truncate">{exp.name}</span>
                      <ArrowRight size={12} className="shrink-0 ml-1" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Event Volume Chart ─────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#0b1c30]">Event Volume</h2>
          <p className="text-xs text-[#727785]">Daily event count over the last 7 days, by primary metric</p>
        </div>

        <div className="bg-white border border-[#dde3f0] rounded-xl p-6">
          {chartRows.length === 0 ? (
            <div className="text-center text-[#727785] py-8 text-sm">No event data in the last 7 days.</div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-5 mb-6 flex-wrap">
                {metricNames.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: metricColors[m] }} />
                    <span className="text-xs font-mono text-[#424754]">{m}</span>
                  </div>
                ))}
              </div>

              {/* Stacked bars — fixed pixel heights to guarantee rendering */}
              <div className="flex items-end gap-3">
                {chartRows.map(({ day, segments, total }) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-2">
                    {/* Bar column */}
                    <div
                      className="w-full flex flex-col-reverse rounded overflow-hidden"
                      style={{ height: CHART_H }}
                    >
                      {segments.map(({ metric, count }) => {
                        if (count === 0) return null;
                        const px = Math.round((count / maxTotal) * CHART_H);
                        return (
                          <div
                            key={metric}
                            title={`${metric}: ${count.toLocaleString()}`}
                            className="w-full hover:opacity-80 transition-opacity"
                            style={{
                              height: px,
                              backgroundColor: metricColors[metric],
                              flexShrink: 0,
                            }}
                          />
                        );
                      })}
                    </div>
                    {/* X-axis label */}
                    <div className="text-[10px] text-[#9ba8c0] tabular-nums">
                      {new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    {/* Total count */}
                    <div className="text-xs font-semibold text-[#0b1c30] tabular-nums">
                      {formatNumber(total)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Event Taxonomy Table ───────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#0b1c30]">Event Taxonomy</h2>
          <p className="text-xs text-[#727785]">All event types tracked by your Caliper SDK</p>
        </div>

        <div className="bg-white border border-[#dde3f0] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#f8f9ff] border-b border-[#dde3f0]">
              <tr>
                {["Event Name", "Type", "Total Events", "Unique Users", "First Seen", "Last Seen"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-[11px] uppercase tracking-wider text-[#424754] font-semibold ${i >= 2 && i <= 3 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde3f0]/60">
              {(taxonomy as MetricsTaxonomyRow[]).map((row) => (
                <tr key={row.event_name} className="hover:bg-[#f8f9ff] transition-colors">
                  <td className="px-5 py-3.5">
                    <code className="text-sm font-mono text-[#0b1c30]">{row.event_name}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${TYPE_BADGE[row.type] ?? TYPE_BADGE.Custom}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-sm text-[#0b1c30] font-semibold">
                    {row.total_events.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-sm text-[#424754]">
                    {row.unique_users.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#727785]">
                    {formatRelativeTime(row.first_seen)}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#727785]">
                    {formatRelativeTime(row.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
