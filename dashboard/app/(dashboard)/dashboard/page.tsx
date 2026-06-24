import { headers } from "next/headers";
import Link from "next/link";
import {
  Activity, FlaskConical, Users, TrendingDown,
  ArrowRight, Database, Sparkles, AlertTriangle,
} from "lucide-react";
import type { DashboardData, DashboardTimeseries, KpiSparklineSeries, ExperimentComparisonResponse } from "@/lib/types";
import { EventsOverTimeChart } from "@/components/charts/EventsOverTimeChart";
import { KpiSparkline } from "@/components/charts/KpiSparkline";
import { ComparisonGrid } from "@/components/dashboard/ComparisonGrid";

const DEMO_API_KEY = "caliper_demo_key_public";

async function fetchDashboardData(): Promise<DashboardData | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const res = await fetch(`${protocol}://${host}/api/dashboard`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Failed to fetch dashboard:", await res.text());
    return null;
  }
  return res.json();
}

async function fetchTimeseries(): Promise<DashboardTimeseries | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const res = await fetch(`${protocol}://${host}/api/dashboard/timeseries`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchComparisonData(): Promise<ExperimentComparisonResponse | null> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const res = await fetch(`${protocol}://${host}/api/dashboard/comparison`, {
    headers: { "X-API-Key": DEMO_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) return null;
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

export default async function DashboardPage() {
  const [data, timeseries, comparison] = await Promise.all([
    fetchDashboardData(),
    fetchTimeseries(),
    fetchComparisonData(),
  ]);

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          Failed to load dashboard data. Please refresh the page.
        </div>
      </div>
    );
  }

  const { kpis, activity } = data;
  const ks = timeseries?.kpi_sparklines;

  const UNIFORM_KPIS: Array<{
    label: string;
    value: string;
    sub: string;
    icon: typeof FlaskConical;
    sparklineKey: keyof KpiSparklineSeries;
  }> = [
    {
      label: "Active",
      value: kpis.active_experiments.toString(),
      sub: "Experiments running",
      icon: FlaskConical,
      sparklineKey: "active_experiments",
    },
    {
      label: "Events",
      value: formatNumber(kpis.total_events),
      sub: "Ingested via SDK",
      icon: Activity,
      sparklineKey: "total_events",
    },
    {
      label: "Users",
      value: formatNumber(kpis.total_users),
      sub: "Assigned to variants",
      icon: Users,
      sparklineKey: "total_users",
    },
    {
      label: "CUPED",
      value: kpis.avg_cuped_variance_reduction != null
        ? `${kpis.avg_cuped_variance_reduction.toFixed(1)}%`
        : "—",
      sub: "Avg variance reduction",
      icon: TrendingDown,
      sparklineKey: "avg_cuped_variance_reduction",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-bold text-[#0b1c30] tracking-tight mb-1">Dashboard</h1>
        <p className="text-[#424754] text-sm">
          Workspace overview — your experiments, data, and insights at a glance.
        </p>
      </div>

      {/* KPI cards — 3×2 grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {/* 4 uniform cards */}
        {UNIFORM_KPIS.map(({ label, value, sub, icon: Icon, sparklineKey }) => (
          <div key={label} className="bg-white border border-[#c2c6d6] rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">{label}</p>
              <Icon size={16} className="text-[#0058be]" strokeWidth={1.8} />
            </div>
            <p className="text-[28px] font-bold text-[#0b1c30] tabular-nums leading-none mb-1">{value}</p>
            <p className="text-[11px] text-[#727785] mb-3">{sub}</p>
            {ks?.[sparklineKey] && (
              <KpiSparkline data={ks[sparklineKey]} color="#0058be" height={32} />
            )}
          </div>
        ))}

        {/* SRM Alerts */}
        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">SRM Alerts</p>
            <AlertTriangle
              size={16}
              className={kpis.srm_alerts > 0 ? "text-red-600" : "text-[#9ba8c0]"}
              strokeWidth={1.8}
            />
          </div>
          <p className={`text-[28px] font-bold tabular-nums leading-none mb-1 ${
            kpis.srm_alerts > 0 ? "text-red-600" : "text-[#0b1c30]"
          }`}>
            {kpis.srm_alerts}
          </p>
          <p className="text-[11px] text-[#727785] mb-3">
            {kpis.srm_alerts === 0
              ? "All randomization healthy"
              : `${kpis.srm_alerts === 1 ? "Experiment" : "Experiments"} flagged`}
          </p>
          {ks?.srm_alerts && (
            <KpiSparkline
              data={ks.srm_alerts}
              color={kpis.srm_alerts > 0 ? "#dc2626" : "#0058be"}
              height={32}
            />
          )}
        </div>

        {/* AI Readouts */}
        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-wider text-[#424754] font-semibold">AI Readouts</p>
            <Sparkles size={16} className="text-[#0058be]" strokeWidth={1.8} />
          </div>
          <p className="text-[28px] font-bold text-[#0b1c30] tabular-nums leading-none mb-1">
            {kpis.readouts_generated}
          </p>
          <p className="text-[11px] text-[#727785] mb-3">Generated by Bedrock</p>
          {ks?.readouts_generated && (
            <KpiSparkline data={ks.readouts_generated} color="#0058be" height={32} />
          )}
        </div>
      </div>

      {/* Event Volume chart */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-[#0b1c30]">Event Volume</h2>
          <p className="text-xs text-[#727785]">Daily events ingested by primary metric · Last 7 days</p>
        </div>
        <div className="bg-white border border-[#c2c6d6] rounded-xl p-6">
          {timeseries?.daily_volume ? (
            <EventsOverTimeChart data={timeseries.daily_volume} />
          ) : (
            <div className="text-center text-[#727785] py-8">No event data in the last 7 days.</div>
          )}
        </div>
      </div>

      {/* Experiment Comparison Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#0b1c30]">Active Experiments Comparison</h2>
            <p className="text-xs text-[#727785]">Side-by-side view of all running experiments · click any column for full detail</p>
          </div>
          <Link
            href="/experiments"
            className="text-sm text-[#0058be] hover:underline flex items-center gap-1"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <ComparisonGrid experiments={comparison?.experiments ?? []} />
      </div>

      {/* Recent Activity — full width below the grid */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-[#0b1c30] mb-4">Recent Activity</h2>
        <div className="bg-white border border-[#c2c6d6] rounded-xl divide-y divide-[#dde3f0]">
          {activity.length === 0 ? (
            <div className="p-5 text-sm text-[#727785]">No recent activity.</div>
          ) : (
            activity.map((item, i) => {
              const Icon = item.type === "readout" ? Sparkles : Database;
              return (
                <div key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-[#eff4ff] shrink-0">
                      <Icon size={13} className="text-[#0058be]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0b1c30] truncate">{item.title}</p>
                      <p className="text-xs text-[#727785] truncate">{item.subtitle}</p>
                      <p className="text-[10px] text-[#9ba8c0] mt-1 uppercase tracking-wider">
                        {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
