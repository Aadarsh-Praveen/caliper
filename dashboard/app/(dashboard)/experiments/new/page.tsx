import { ExperimentForm } from "@/components/experiments/ExperimentForm";

export default function NewExperimentPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b] tracking-tight">New experiment</h1>
        <p className="text-sm text-slate-500 mt-1">
          Define your hypothesis, variants, and success metrics.
        </p>
      </div>
      <ExperimentForm />
    </div>
  );
}
