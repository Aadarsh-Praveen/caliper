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

export interface KpiDailyPoint {
  day: string;
  value: number;
}

export interface KpiSparklineSeries {
  active_experiments: KpiDailyPoint[];
  total_events: KpiDailyPoint[];
  total_users: KpiDailyPoint[];
  avg_cuped_variance_reduction: KpiDailyPoint[];
  srm_alerts: KpiDailyPoint[];
  readouts_generated: KpiDailyPoint[];
}

export interface DailyMetricVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface DailyExperimentLift {
  day: string;
  control_n: number;
  control_conversions: number;
  control_rate: number;
  treatment_n: number;
  treatment_conversions: number;
  treatment_rate: number;
  lift_pct: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  drop_off_pct: number | null;
}

export interface ExperimentTimeseries {
  daily_lift: DailyExperimentLift[];
  funnel: FunnelStep[];
}

export interface DashboardTimeseries {
  daily_volume: DailyMetricVolume[];
  sparklines: Record<string, Array<{ day: string; lift_pct: number }>>;
  kpi_sparklines: KpiSparklineSeries;
}

export interface SettingsPageData {
  counts: {
    readouts_generated: number;
    experiments_created: number;
    events_ingested: number;
    assignments_total: number;
  };
  dbt_last_run: string | null;
}

export interface MetricRegistryItem {
  event_name: string;
  metric_type: string;
  experiments: Array<{ id: string; name: string; slug: string }>;
  total_events_7d: number;
  unique_users_7d: number;
  avg_conversion_rate: number | null;
}

export interface MetricsDailyVolume {
  day: string;
  event_name: string;
  count: number;
}

export interface MetricsTaxonomyRow {
  event_name: string;
  type: string;
  total_events: number;
  unique_users: number;
  first_seen: string;
  last_seen: string;
}

export interface MetricsPageData {
  registry: MetricRegistryItem[];
  daily_volume: MetricsDailyVolume[];
  taxonomy: MetricsTaxonomyRow[];
  range_days: number;
}

export interface ExperimentListResponse {
  experiments: Experiment[];
  srm_alerts: number;
  readouts_generated: number;
}

export interface ExperimentComparisonItem {
  id: string;
  slug: string;
  name: string;
  status: string;
  lift: number | null;
  p_value: number | null;
  msprt_p_value: number | null;
  cuped_variance_reduction: number | null;
  srm_flag: unknown;
  n_total: number;
  daily_lift: DailyExperimentLift[];
  funnel: FunnelStep[];
}

export interface ExperimentComparisonResponse {
  experiments: ExperimentComparisonItem[];
}

export interface DashboardKPIs {
  active_experiments: number;
  total_events: number;
  total_users: number;
  avg_cuped_variance_reduction: number | null;
  srm_alerts: number;
  readouts_generated: number;
}

export interface DashboardActivityItem {
  type: string;
  title: string;
  subtitle: string;
  timestamp: string;
  experiment_id?: string;
  experiment_slug?: string;
}

export interface DashboardData {
  kpis: DashboardKPIs;
  experiments: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    lift: number | null;
    p_value: number | null;
    msprt_p_value: number | null;
    srm_flag: unknown;
    n_total: number;
  }>;
  activity: DashboardActivityItem[];
}
