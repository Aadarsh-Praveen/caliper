"use client";

import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

interface Props {
  data: FunnelStep[];
  compact?: boolean;
}

const COLORS = ["#0058be", "#2563eb", "#7c3aed", "#a855f7"];

export function ConversionFunnel({ data, compact = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className={`text-center text-[#727785] ${compact ? "py-4 text-xs" : "py-8"}`}>
        No funnel data yet.
      </div>
    );
  }

  const funnelData = data.map((step, i) => ({
    name: step.step,
    value: step.count,
    fill: COLORS[i % COLORS.length],
    drop_off_pct: step.drop_off_pct,
  }));

  const height = compact ? 180 : 300;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #c2c6d6",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value) => [String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")]}
          />
          <Funnel
            dataKey="value"
            data={funnelData}
            isAnimationActive
            stroke="#fff"
            strokeWidth={2}
          >
            {!compact && (
              <LabelList
                position="right"
                fill="#0b1c30"
                stroke="none"
                dataKey="name"
                style={{ fontSize: "12px", fontWeight: 500 }}
              />
            )}
            <LabelList
              position="center"
              fill="#fff"
              stroke="none"
              dataKey="value"
              style={{ fontSize: compact ? "10px" : "13px", fontWeight: 600 }}
              formatter={(v) => (typeof v === "number" ? v.toLocaleString() : String(v ?? ""))}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>

      {!compact && (
        <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
          {data.map((step) => (
            <div key={step.step} className="bg-white border border-[#c2c6d6] rounded-lg p-3">
              <p className="font-mono text-[#0b1c30] truncate" title={step.step}>
                {step.step}
              </p>
              <p className="font-bold text-[#0b1c30] tabular-nums mt-1 text-base">
                {step.count.toLocaleString()}
              </p>
              {step.drop_off_pct !== null && (
                <p className="text-[#727785] tabular-nums">
                  {step.drop_off_pct > 0 ? "-" : ""}
                  {Math.abs(step.drop_off_pct).toFixed(1)}% drop
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
