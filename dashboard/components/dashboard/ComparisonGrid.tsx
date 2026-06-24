"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ExperimentColumn } from "./ExperimentColumn";
import type { ExperimentComparisonItem } from "@/lib/types";

interface Props {
  experiments: ExperimentComparisonItem[];
}

export function ComparisonGrid({ experiments }: Props) {
  if (!experiments || experiments.length === 0) {
    return (
      <div className="bg-white border border-[#c2c6d6] rounded-xl p-10 text-center">
        <p className="text-sm text-[#727785] mb-2">No active experiments.</p>
        <Link href="/experiments" className="text-sm text-[#0058be] hover:underline inline-flex items-center gap-1">
          View all experiments <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {experiments.map((exp) => (
        <ExperimentColumn key={exp.id} experiment={exp} />
      ))}
    </div>
  );
}
