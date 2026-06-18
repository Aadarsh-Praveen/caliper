import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VariantStats } from "@/lib/types";

interface Props {
  stat: VariantStats;
  isControl?: boolean;
}

function formatPct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

export function StatsCard({ stat, isControl }: Props) {
  return (
    <Card className="bg-[#1A1A1A] border-[#2A2A2A] flex-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[#888888] uppercase tracking-wider">
          {stat.name}
          {isControl && (
            <span className="ml-2 text-[10px] bg-[#2A2A2A] text-[#888888] px-1.5 py-0.5 rounded">
              control
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold text-[#F5F3EE]">{stat.n.toLocaleString()}</div>
          <div className="text-xs text-[#888888] mt-0.5">users</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-[#F5F3EE]">
            {formatPct(stat.conversion_rate)}
          </div>
          <div className="text-xs text-[#888888] mt-0.5">conversion rate</div>
        </div>
        <div>
          <div className="text-sm text-[#888888]">
            {stat.conversions.toLocaleString()} conversions
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
