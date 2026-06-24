"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Experiment } from "@/lib/types";

interface StatusConfig {
  badge: string;
  leftBorder: string;
  dot: string;
  pulse: boolean;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: {
    badge: "bg-slate-100 text-slate-500 border-slate-200",
    leftBorder: "border-l-slate-300",
    dot: "bg-slate-400",
    pulse: false,
  },
  running: {
    badge: "bg-green-50 text-green-700 border-green-200",
    leftBorder: "border-l-green-500",
    dot: "bg-green-500",
    pulse: true,
  },
  stopped: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    leftBorder: "border-l-amber-400",
    dot: "bg-amber-500",
    pulse: false,
  },
  completed: {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    leftBorder: "border-l-blue-500",
    dot: "bg-blue-500",
    pulse: false,
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, delay: i * 0.06, ease: [0.0, 0.0, 0.2, 1] as [number, number, number, number] },
  }),
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

const MotionTr = motion.tr;

export function ExperimentList({ experiments }: Props) {
  if (experiments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-16 text-center shadow-sm">
        <div className="flex justify-center mb-5">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="4" y="8" width="32" height="2" rx="1" fill="#CBD5E1" />
            <rect x="4" y="30" width="32" height="2" rx="1" fill="#CBD5E1" />
            <rect x="6" y="8" width="2" height="24" rx="1" fill="#CBD5E1" />
            <rect x="32" y="8" width="2" height="24" rx="1" fill="#CBD5E1" />
            <rect x="17" y="19" width="6" height="2" rx="1" fill="#3b82f6" opacity="0.6" />
          </svg>
        </div>
        <p className="text-slate-800 text-sm font-semibold mb-1.5">No experiments yet</p>
        <p className="text-slate-400 text-xs mb-6">
          Create your first experiment to start measuring impact.
        </p>
        <Link
          href="/experiments/new"
          className="inline-flex items-center gap-1.5 text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors"
        >
          Create experiment
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.0, 0.0, 0.2, 1] }}
      className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm"
    >
      <Table>
        <TableHeader>
          <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50">
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider pl-5">
              Name
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              Metric
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider text-right">
              Sample
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider text-right">
              P-Value
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider text-right">
              Sequential
            </TableHead>
            <TableHead className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider text-right pr-5">
              Updated
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {experiments.map((exp, i) => {
            const cfg = STATUS_CONFIG[exp.status] ?? STATUS_CONFIG.draft;
            return (
              <MotionTr
                key={exp.id}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors duration-100 border-l-2 ${cfg.leftBorder}`}
              >
                <TableCell className="pl-4 py-4">
                  <Link
                    href={`/experiments/${exp.id}`}
                    className="font-semibold text-slate-900 hover:text-[#3b82f6] transition-colors text-sm"
                  >
                    {exp.name}
                  </Link>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    {exp.slug}
                  </div>
                </TableCell>

                <TableCell className="py-4">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] border px-2.5 py-1 rounded-full font-semibold ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? "running-pulse" : ""}`} />
                    {exp.status}
                  </span>
                </TableCell>

                <TableCell className="py-4 text-slate-500 font-mono text-xs">
                  {exp.primary_metric}
                </TableCell>

                <TableCell className="py-4 text-right text-slate-800 text-sm tabular-nums font-medium">
                  {exp.sample_size != null ? (
                    exp.sample_size.toLocaleString()
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>

                <TableCell className="py-4 text-right font-mono text-xs tabular-nums">
                  {exp.p_value != null ? (
                    <span className={exp.p_value < 0.05 ? "text-[#10b981] font-semibold" : "text-slate-700"}>
                      {exp.p_value.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>

                <TableCell className="py-4 text-right font-mono text-xs tabular-nums">
                  {exp.msprt_p_value != null ? (
                    <span className={exp.msprt_should_stop ? "text-[#10b981] font-semibold" : "text-slate-500"}>
                      {exp.msprt_p_value.toFixed(3)}
                      {exp.msprt_should_stop && <span className="ml-1 text-[9px]">✓</span>}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>

                <TableCell className="py-4 text-right text-slate-400 text-xs pr-5">
                  {relativeTime(exp.started_at ?? exp.created_at)}
                </TableCell>
              </MotionTr>
            );
          })}
        </TableBody>
      </Table>
    </motion.div>
  );
}
