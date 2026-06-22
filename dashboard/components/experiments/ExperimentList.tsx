"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Experiment } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[#2A2A2A] text-[#888888] border-[#2A2A2A]",
  running: "bg-green-950 text-green-400 border-green-800",
  stopped: "bg-yellow-950 text-yellow-400 border-yellow-800",
  completed: "bg-blue-950 text-blue-400 border-blue-800",
};

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ExperimentWithStats extends Experiment {
  sample_size?: number;
  p_value?: number | null;
  msprt_p_value?: number | null;
  msprt_should_stop?: boolean;
}

interface Props {
  experiments: ExperimentWithStats[];
}

export function ExperimentList({ experiments }: Props) {
  if (experiments.length === 0) {
    return (
      <div className="rounded border border-[#2A2A2A] bg-[#1A1A1A] p-12 text-center">
        <p className="text-[#888888] text-sm">No experiments yet.</p>
        <Link
          href="/experiments/new"
          className="inline-block mt-4 text-sm text-[#B8923A] hover:underline"
        >
          Create your first experiment →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#2A2A2A] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-[#2A2A2A] hover:bg-transparent">
            <TableHead className="text-[#888888] font-medium">Name</TableHead>
            <TableHead className="text-[#888888] font-medium">Status</TableHead>
            <TableHead className="text-[#888888] font-medium">Primary metric</TableHead>
            <TableHead className="text-[#888888] font-medium text-right">Sample size</TableHead>
            <TableHead className="text-[#888888] font-medium text-right">p-value</TableHead>
            <TableHead className="text-[#888888] font-medium text-right">Sequential</TableHead>
            <TableHead className="text-[#888888] font-medium text-right">Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {experiments.map((exp) => (
            <TableRow key={exp.id} className="border-[#2A2A2A] hover:bg-[#1A1A1A]/60">
              <TableCell>
                <Link
                  href={`/experiments/${exp.id}`}
                  className="font-medium text-[#F5F3EE] hover:text-[#B8923A] transition-colors"
                >
                  {exp.name}
                </Link>
                <div className="text-xs text-[#888888] mt-0.5 font-mono">{exp.slug}</div>
              </TableCell>
              <TableCell>
                <Badge className={`text-xs border ${STATUS_COLORS[exp.status] ?? ""}`} variant="outline">
                  {exp.status}
                </Badge>
              </TableCell>
              <TableCell className="text-[#888888] font-mono text-sm">
                {exp.primary_metric}
              </TableCell>
              <TableCell className="text-right text-[#F5F3EE]">
                {exp.sample_size?.toLocaleString() ?? "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {exp.p_value != null ? exp.p_value.toFixed(3) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {exp.msprt_p_value != null ? (
                  <span
                    className={
                      exp.msprt_should_stop
                        ? "text-green-400"
                        : "text-[#888888]"
                    }
                  >
                    {exp.msprt_p_value.toFixed(3)}
                  </span>
                ) : (
                  <span className="text-[#555555]">—</span>
                )}
              </TableCell>
              <TableCell className="text-right text-[#888888] text-sm">
                {relativeTime(exp.started_at ?? exp.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
