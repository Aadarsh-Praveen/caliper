// Abramowitz & Stegun 26.2.17 approximation for the normal CDF
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? p : 1 - p;
}

export interface ZTestResult {
  lift: number;
  lift_ci: [number, number];
  p_value: number;
  is_significant: boolean;
}

export function twoProportionZTest(
  n1: number,
  x1: number,
  n2: number,
  x2: number,
  alpha = 0.05
): ZTestResult | null {
  if (n1 < 1 || n2 < 1) return null;

  const p1 = x1 / n1;
  const p2 = x2 / n2;

  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));

  if (se === 0) return null;

  const z = (p2 - p1) / se;
  const p_value = 2 * (1 - normalCDF(Math.abs(z)));

  const z_alpha = 1.96; // 95% CI
  const se_diff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const diff = p2 - p1;
  const lift_ci: [number, number] = [diff - z_alpha * se_diff, diff + z_alpha * se_diff];

  const lift = p1 > 0 ? (p2 - p1) / p1 : 0;

  return {
    lift,
    lift_ci,
    p_value,
    is_significant: p_value < alpha,
  };
}
