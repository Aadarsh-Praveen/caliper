"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface DailyLiftRow {
  day: string;
  lift_pct: number;
}

interface Props {
  data: DailyLiftRow[];
  compact?: boolean;
}

export function LiftTrendChart({ data, compact = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className={`text-center text-[#727785] ${compact ? "py-4 text-xs" : "py-8"}`}>
        No daily lift data yet.
      </div>
    );
  }

  const height = compact ? 140 : 260;
  const tickSize = compact ? 9 : 11;
  const margin = compact
    ? { top: 5, right: 5, left: -25, bottom: 0 }
    : { top: 10, right: 16, left: 0, bottom: 0 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={margin}>
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
              value: "Lift (%)",
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
          formatter={(value) => [typeof value === "number" ? `${value.toFixed(2)}%` : "—", "Cumulative lift"]}
        />
        <ReferenceLine y={0} stroke="#c2c6d6" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="lift_pct"
          stroke="#0058be"
          strokeWidth={2}
          dot={compact ? false : { r: 4, fill: "#0058be" }}
          activeDot={{ r: 6 }}
          name="Cumulative lift"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
