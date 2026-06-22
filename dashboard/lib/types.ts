export interface Variant {
  name: string;
  allocation: number;
}

export interface Experiment {
  id: string;
  customer_id: string;
  name: string;
  slug: string;
  hypothesis: string | null;
  primary_metric: string;
  metric_type: "binary" | "continuous";
  secondary_metrics: string[];
  guardrail_metrics: string[];
  variants: Variant[];
  status: "draft" | "running" | "stopped" | "completed";
  cuped_enabled: boolean;
  cuped_covariate: string | null;
  sequential_enabled: boolean;
  minimum_detectable_effect: number | null;
  baseline_conversion_rate: number | null;
  target_power: number;
  significance_level: number;
  created_at: string;
  started_at: string | null;
  stopped_at: string | null;
}

export interface EventPayload {
  event_name: string;
  experiment_id: string;
  variant: string;
  properties: Record<string, unknown>;
  ts: string;
  context: Record<string, unknown>;
}

export interface IngestRequest {
  user_id: string;
  events: EventPayload[];
}

export interface AssignResponse {
  variant: string;
  experiment_id: string;
  assigned_at: string;
}

export interface VariantStats {
  name: string;
  n: number;
  conversions: number;
  conversion_rate: number;
  mean: number;
  variance: number;
  cuped_adjusted_mean?: number;
  cuped_adjusted_variance?: number;
  variance_reduction_pct?: number;
}

export interface Readout {
  id: string;
  experiment_id: string;
  verdict: "treatment_wins" | "control_wins" | "no_significant_difference" | "srm_invalidated" | "insufficient_data";
  summary: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  generated_at: string;
  model_id: string;
}

export interface SegmentRow {
  segment_dimension: string;
  segment_value: string;
  variant: string;
  n: number;
  conversions: number;
  conversion_rate: number;
}

export interface ExperimentResults {
  experiment: Experiment;
  variants: VariantStats[];
  lift: number | null;
  lift_ci: [number, number] | null;
  cuped_lift_ci: [number, number] | null;
  p_value: number | null;
  msprt_p_value: number | null;
  msprt_should_stop: boolean;
  is_significant: boolean;
  srm_flag: { observed: Record<string, number>; expected: Record<string, number>; chi2_stat: number; p_value: number } | null;
  segments: SegmentRow[];
  readout: Readout | null;
}

export interface Summary {
  experiment_id: string;
  variant: string;
  n: number;
  conversions: number;
  sum: number;
  sum_sq: number;
}

export interface Customer {
  id: string;
  slug: string;
  plan: string;
}
