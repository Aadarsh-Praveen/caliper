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
}

export interface ExperimentResults {
  experiment: Experiment;
  variants: VariantStats[];
  lift: number | null;
  lift_ci: [number, number] | null;
  p_value: number | null;
  is_significant: boolean;
  srm_flag: null;
  segments: never[];
  readout: null;
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
