"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyVolumeRow {
  day: string;
  event_name: string;
  count: number;
}

interface Props {
  data: DailyVolumeRow[];
}

const COLORS = ["#0058be", "#2563eb", "#7c3aed", "#a855f7", "#c084fc"];

export function EventsOverTimeChart({ data }: Props) {
  const days = Array.from(new Set(data.map((d) => d.day))).sort();
  const metrics = Array.from(new Set(data.map((d) => d.event_name)));

  const chartData = days.map((day) => {
    const row: Record<string, string | number> = { day };
    for (const metric of metrics) {
      row[metric] = data.find((d) => d.day === day && d.event_name === metric)?.count || 0;
    }
    return row;
  });

  if (chartData.length === 0) {
    return (
      <div className="text-center text-[#727785] py-8">No event data in the last 7 days.</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="day"
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v: string) => {
            const d = new Date(v + "T00:00:00");
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis
          stroke="#727785"
          tick={{ fontSize: 11, fill: "#727785" }}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString())}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #c2c6d6",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        {metrics.map((metric, i) => (
          <Bar
            key={metric}
            dataKey={metric}
            stackId="a"
            fill={COLORS[i % COLORS.length]}
            radius={i === metrics.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
