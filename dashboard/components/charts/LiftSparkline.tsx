"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface SparklineRow {
  day: string;
  lift_pct: number;
}

interface Props {
  data: SparklineRow[];
  width?: number;
  height?: number;
}

export function LiftSparkline({ data, width = 100, height = 32 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] text-[#c2c6d6]"
      >
        no data
      </div>
    );
  }

  const lastLift = data[data.length - 1]?.lift_pct ?? 0;
  const color = lastLift > 1 ? "#10b981" : lastLift < -1 ? "#ef4444" : "#727785";

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Line
            type="monotone"
            dataKey="lift_pct"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
