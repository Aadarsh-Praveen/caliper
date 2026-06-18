import { ExperimentForm } from "@/components/experiments/ExperimentForm";

export default function NewExperimentPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F5F3EE]">New experiment</h1>
        <p className="text-sm text-[#888888] mt-1">
          Define your hypothesis, variants, and success metrics.
        </p>
      </div>
      <ExperimentForm />
    </div>
  );
}
