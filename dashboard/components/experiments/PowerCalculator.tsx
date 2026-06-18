"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  baselineRate: number;
  mde: number;
  dailyVisitors?: number;
}

export function PowerCalculator({ baselineRate, mde, dailyVisitors = 2000 }: Props) {
  const p = baselineRate;
  const d = mde;

  let requiredN: number | null = null;
  let days: number | null = null;

  if (p > 0 && p < 1 && d > 0) {
    requiredN = Math.ceil((16 * p * (1 - p)) / (d * d));
    days = Math.ceil(requiredN / dailyVisitors);
  }

  return (
    <Card className="bg-[#1A1A1A] border-[#2A2A2A] h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-[#888888] uppercase tracking-wider">
          Power Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredN !== null && days !== null ? (
          <>
            <div>
              <div className="text-3xl font-bold text-[#B8923A]">
                {requiredN.toLocaleString()}
              </div>
              <div className="text-xs text-[#888888] mt-1">users per variant required</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-[#F5F3EE]">~{days} days</div>
              <div className="text-xs text-[#888888] mt-1">
                at {dailyVisitors.toLocaleString()} daily visitors per variant
              </div>
            </div>
            <p className="text-xs text-[#888888] border-t border-[#2A2A2A] pt-3">
              With your current baseline rate ({(baselineRate * 100).toFixed(1)}%) and MDE (
              {(mde * 100).toFixed(1)}%), you need ~{requiredN.toLocaleString()} users per
              variant. At {dailyVisitors.toLocaleString()} daily visitors per variant,
              that&apos;s ~{days} days.
            </p>
          </>
        ) : (
          <p className="text-sm text-[#888888]">
            Enter a baseline conversion rate and minimum detectable effect to see the required
            sample size.
          </p>
        )}

        <div className="text-xs text-[#888888] space-y-1 border-t border-[#2A2A2A] pt-3">
          <div className="flex justify-between">
            <span>Power</span>
            <span className="text-[#F5F3EE]">80%</span>
          </div>
          <div className="flex justify-between">
            <span>Significance</span>
            <span className="text-[#F5F3EE]">95%</span>
          </div>
          <div className="flex justify-between">
            <span>Test type</span>
            <span className="text-[#F5F3EE]">two-sided z-test</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
