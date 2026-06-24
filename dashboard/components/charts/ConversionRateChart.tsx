"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyLiftRow {
  day: string;
  control_rate: number;
  treatment_rate: number;
}

interface Props {
  data: DailyLiftRow[];
  compact?: boolean;
}

export function ConversionRateChart({ data, compact = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className={`text-center text-[#727785] ${compact ? "py-4 text-xs" : "py-8"}`}>
        No data yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    day: d.day,
    control: d.control_rate * 100,
    treatment: d.treatment_rate * 100,
  }));

  const height = compact ? 140 : 260;
  const tickSize = compact ? 9 : 11;
  const margin = compact
    ? { top: 5, right: 5, left: -25, bottom: 0 }
    : { top: 10, right: 16, left: 0, bottom: 0 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="day"
          stroke="#727785"
          tick={{ fontSize: tickSize, fill: "#727785" }}
          tickFormatter={(v: string) => {
            const d = new Date(v + "T00:00:00");
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
          hide={compact}
        />
        <YAxis
          stroke="#727785"
          tick={{ fontSize: tickSize, fill: "#727785" }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          {...(!compact && {
            label: {
              value: "Conversion rate",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "#727785" },
            },
          })}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #c2c6d6",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value) => [typeof value === "number" ? `${value.toFixed(2)}%` : "—"]}
        />
        {!compact && <Legend wrapperStyle={{ fontSize: "12px" }} />}
        <Line
          type="monotone"
          dataKey="control"
          stroke="#727785"
          strokeWidth={2}
          dot={compact ? false : { r: 3, fill: "#727785" }}
          name="Control"
        />
        <Line
          type="monotone"
          dataKey="treatment"
          stroke="#0058be"
          strokeWidth={2}
          dot={compact ? false : { r: 3, fill: "#0058be" }}
          name="Treatment"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
