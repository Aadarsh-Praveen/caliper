"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface KpiPoint {
  day: string;
  value: number;
}

interface Props {
  data: KpiPoint[];
  color?: string;
  height?: number;
}

export function KpiSparkline({ data, color = "#0058be", height = 36 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center text-[10px] text-[#c2c6d6]">
        —
      </div>
    );
  }

  const allSame = data.every((d) => d.value === data[0].value);
  const sparklineColor = allSame ? "#c2c6d6" : color;

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={sparklineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
