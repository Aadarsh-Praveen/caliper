# Caliper Phase 3 — CUPED + mSPRT in Aggregator Lambda

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root. Read it end-to-end before starting, then execute section by section.**

---

## 0. Context — what's done and what we're adding

**Done in previous phases:**
- DynamoDB + Aurora + Bedrock + IAM all configured
- Backend APIs and dashboard UI live at `caliper-xi.vercel.app`
- Headphones site at the live `web/` Vercel URL, SDK firing events to production
- Aggregator Lambda processing DynamoDB Streams with z-test, Welch's t, and SRM detection
- Three experiments populated with ~31K synthetic events (`hero_cta_test`, `buy_button_test`, `nav_layout_test`)
- 14/14 unit tests passing in `dashboard/lambdas/aggregator/tests/`

**What you're adding now:**

Two statistical methods, both in the aggregator Lambda:

1. **CUPED (Controlled-experiment Using Pre-Experiment Data)** — variance reduction technique. When an experiment has a pre-experiment covariate per user, CUPED adjusts the outcome by subtracting `θ * (X - X̄)` where θ is the regression coefficient. Result: smaller confidence intervals, faster significance detection.

2. **mSPRT (mixture Sequential Probability Ratio Test)** — sequential testing that produces always-valid p-values. Lets users peek at results during a running experiment without inflating false-positive rates.

Plus dashboard updates to display the new metrics.

## 1. What NOT to do this phase

Out of scope — explicitly skip:

- ❌ Bedrock readouts (Phase 4)
- ❌ MLflow integration (Phase 4)
- ❌ dbt segment models (separate phase)
- ❌ Dashboard UI redesign or polish beyond what's needed to display the new metrics
- ❌ Regenerating synthetic data (already done with new SK format if needed)
- ❌ Multi-variant (A/B/C/D) testing — we're keeping 2-arm tests
- ❌ Bayesian methods — deliberately scoped out

Stay focused. Add CUPED and mSPRT to the aggregator. Show them on the dashboard. Done.

---

## 2. CUPED — implementation

### 2.1 Mathematical background

For a binary or continuous outcome Y and a pre-experiment covariate X (typically the user's outcome value in the period before the experiment), the CUPED adjusted outcome is:

```
Y_cuped = Y - θ * (X - X̄)
```

where:
- `θ = Cov(Y, X) / Var(X)` — the regression coefficient
- `X̄` is the sample mean of X across all users
- Variance reduction: `Var(Y_cuped) = Var(Y) * (1 - ρ²)` where ρ is the correlation between Y and X

The treatment effect estimate `E[Y_cuped | treatment] - E[Y_cuped | control]` has the same expected value as the unadjusted estimate but with reduced variance, leading to narrower confidence intervals and faster significance detection.

### 2.2 Practical assumption for the hackathon

The headphones demo doesn't actually have pre-experiment data for users. To showcase CUPED working, the synthetic data generator should assign a **simulated pre-experiment activity score** to each user. We treat this as the covariate X.

Update `dashboard/scripts/generate_demo_data.py`:

For each user, generate a covariate `pre_experiment_activity` in [0, 1] from a beta distribution that's correlated with their conversion probability. Specifically:
- Sample `pre_score ~ Beta(2, 5)` (mean ~0.29, somewhat right-skewed)
- The user's conversion probability is then `baseline * (0.5 + pre_score) * (1 + treatment_lift if treatment)`

This creates real correlation between the covariate and the outcome, which CUPED will exploit to reduce variance.

Write `pre_experiment_activity` as a field on the Event items (in the `properties` JSONB) and also on the Assignment items.

### 2.3 Aggregator code — `stats/cuped.py`

```python
"""
CUPED (Controlled-experiment Using Pre-Experiment Data) variance reduction.

Reference: Deng, Xu, Kohavi, Walker (2013).
"Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data"
"""
from typing import List, Optional, Tuple
import math


def compute_theta(y_values: List[float], x_values: List[float]) -> float:
    """
    Compute the CUPED adjustment coefficient θ = Cov(Y, X) / Var(X).
    
    If Var(X) is zero or sample size < 2, return 0.0 (no adjustment).
    """
    n = len(y_values)
    if n < 2 or len(x_values) != n:
        return 0.0
    
    y_mean = sum(y_values) / n
    x_mean = sum(x_values) / n
    
    cov_yx = sum((y - y_mean) * (x - x_mean) for y, x in zip(y_values, x_values)) / (n - 1)
    var_x = sum((x - x_mean) ** 2 for x in x_values) / (n - 1)
    
    if var_x <= 1e-12:
        return 0.0
    
    return cov_yx / var_x


def apply_cuped_adjustment(
    y_values: List[float],
    x_values: List[float],
    theta: float,
    x_grand_mean: float,
) -> List[float]:
    """
    Apply CUPED adjustment: Y_cuped = Y - θ * (X - X̄)
    
    x_grand_mean is computed from ALL users in the experiment (both variants),
    not just one variant. This is critical — using per-variant means breaks the
    method.
    """
    return [y - theta * (x - x_grand_mean) for y, x in zip(y_values, x_values)]


def cuped_summary_statistics(
    y_values: List[float],
    x_values: List[float],
    x_grand_mean: float,
    theta: float,
) -> Tuple[float, float, int]:
    """
    Compute (adjusted_mean, adjusted_variance, n) for CUPED-adjusted Y values.
    
    These are the inputs needed for downstream Welch's t-test or z-test.
    """
    y_adjusted = apply_cuped_adjustment(y_values, x_values, theta, x_grand_mean)
    n = len(y_adjusted)
    if n == 0:
        return 0.0, 0.0, 0
    
    mean = sum(y_adjusted) / n
    if n < 2:
        return mean, 0.0, n
    
    variance = sum((y - mean) ** 2 for y in y_adjusted) / (n - 1)
    return mean, variance, n


def variance_reduction_ratio(theta: float, var_x: float, var_y: float) -> float:
    """
    Returns the ratio of CUPED-adjusted variance to unadjusted variance.
    Lower is better. Typical real-world values: 0.5 to 0.8.
    
    Var(Y_cuped) / Var(Y) = 1 - θ² * Var(X) / Var(Y)
    """
    if var_y <= 1e-12:
        return 1.0
    return max(0.0, 1.0 - (theta ** 2) * var_x / var_y)
```

### 2.4 Aggregator handler — integrate CUPED

In `dashboard/lambdas/aggregator/handler.py`, update the per-experiment processing to:

1. For each experiment, check if `cuped_enabled` flag is set in Aurora (we'll wire this up — for now hardcode it as enabled for all three experiments to keep the path tested)
2. Collect Y values (outcomes — 1 if converted, 0 otherwise) and X values (the `pre_experiment_activity` from the event properties) per user, across both variants
3. Compute the **grand mean** of X across all users
4. Compute θ using pooled data
5. Compute CUPED-adjusted summary statistics per variant
6. Pass adjusted means and variances into Welch's t-test (treat the now-adjusted outcomes as continuous)
7. Write a new Stats item with the CUPED-adjusted results

Note: for true binary outcomes, CUPED is conceptually applied to the proportion. Some practitioners use Welch's t-test on the CUPED-adjusted binary values (which is fine — the central limit theorem makes proportions normally distributed at large n). That's what we'll do here. Document this choice in a comment.

Store the result with a flag indicating it's CUPED-adjusted:

```python
# Write CUPED-adjusted Stats item
table.put_item(Item={
    "PK": f"EXP#{exp_id}",
    "SK": f"STATS#cuped#{variant}",
    "n": n,
    "mean": adjusted_mean,
    "variance": adjusted_variance,
    "theta": theta,
    "x_grand_mean": x_grand_mean,
    "variance_reduction_ratio": vr_ratio,
    "computed_at": datetime.utcnow().isoformat(),
})
```

Also keep the original Stats item without CUPED adjustment — we want to show both side-by-side in the dashboard.

### 2.5 Unit tests for CUPED

In `dashboard/lambdas/aggregator/tests/test_cuped.py`:

```python
import numpy as np
from stats.cuped import compute_theta, apply_cuped_adjustment, cuped_summary_statistics


def test_compute_theta_known_values():
    """Verify θ matches Cov(Y,X) / Var(X) for known data."""
    np.random.seed(42)
    n = 1000
    x = np.random.normal(0, 1, n)
    y = 2 * x + np.random.normal(0, 0.5, n)  # true coefficient = 2
    
    theta = compute_theta(y.tolist(), x.tolist())
    # θ should be close to 2.0
    assert abs(theta - 2.0) < 0.1, f"Expected ~2.0, got {theta}"


def test_zero_variance_x_returns_zero_theta():
    """If X has zero variance, θ should be 0 (no adjustment)."""
    y = [1.0, 2.0, 3.0, 4.0, 5.0]
    x = [3.0, 3.0, 3.0, 3.0, 3.0]
    
    theta = compute_theta(y, x)
    assert theta == 0.0


def test_variance_reduction_on_correlated_data():
    """CUPED should reduce variance when Y and X are correlated."""
    np.random.seed(42)
    n = 5000
    x = np.random.normal(0.3, 0.15, n)  # like pre-experiment activity
    y = 0.05 + 0.3 * x + np.random.normal(0, 0.05, n)  # like conversion rate
    
    x_mean = sum(x) / n
    theta = compute_theta(y.tolist(), x.tolist())
    
    _, var_y_unadjusted, _ = cuped_summary_statistics(y.tolist(), [0.0] * n, 0.0, 0.0)
    _, var_y_adjusted, _ = cuped_summary_statistics(y.tolist(), x.tolist(), x_mean, theta)
    
    # Variance should drop significantly
    assert var_y_adjusted < var_y_unadjusted, "CUPED should reduce variance"
    
    # Expect at least 30% reduction for this strongly correlated data
    reduction = 1 - (var_y_adjusted / var_y_unadjusted)
    assert reduction > 0.3, f"Expected >30% variance reduction, got {reduction:.2%}"


def test_uncorrelated_data_no_variance_reduction():
    """If Y and X are uncorrelated, CUPED should be near-neutral."""
    np.random.seed(42)
    n = 5000
    x = np.random.normal(0.3, 0.15, n)
    y = np.random.normal(0.05, 0.05, n)  # no correlation with X
    
    x_mean = sum(x) / n
    theta = compute_theta(y.tolist(), x.tolist())
    
    _, var_y_unadjusted, _ = cuped_summary_statistics(y.tolist(), [0.0] * n, 0.0, 0.0)
    _, var_y_adjusted, _ = cuped_summary_statistics(y.tolist(), x.tolist(), x_mean, theta)
    
    # Should be approximately equal (small change due to estimation noise)
    ratio = var_y_adjusted / var_y_unadjusted
    assert 0.95 < ratio < 1.05, f"Expected ~1.0 ratio, got {ratio:.3f}"


def test_apply_adjustment_basic():
    """Manual test: known input, verify expected output."""
    y = [0.1, 0.2, 0.3]
    x = [0.0, 0.5, 1.0]
    theta = 0.2
    x_mean = 0.5
    
    adjusted = apply_cuped_adjustment(y, x, theta, x_mean)
    # adjusted[i] = y[i] - 0.2 * (x[i] - 0.5)
    # adjusted = [0.1 - 0.2*(-0.5), 0.2 - 0.2*(0), 0.3 - 0.2*(0.5)]
    #          = [0.2, 0.2, 0.2]
    assert abs(adjusted[0] - 0.2) < 1e-9
    assert abs(adjusted[1] - 0.2) < 1e-9
    assert abs(adjusted[2] - 0.2) < 1e-9
```

---

## 3. mSPRT — implementation

### 3.1 Mathematical background

Classical fixed-horizon p-values are invalid if you peek at the data before reaching the pre-specified sample size. mSPRT (mixture Sequential Probability Ratio Test) produces **always-valid p-values** — they remain valid regardless of when and how often you look.

The key idea: instead of a fixed point-null vs point-alternative test, use a mixture prior over possible effect sizes. The likelihood ratio computed under this mixture is a **martingale** under the null hypothesis, which means optional stopping doesn't bias it.

Practical formula for the two-proportion case (Johari, Pekelis, Walsh 2015):

For each new observation, compute:

```
Λ_t = ∫ exp(s(δ) - t * ψ(δ)) * π(δ) dδ
```

where:
- `s(δ)` is the score (log-likelihood ratio under effect size δ)
- `ψ(δ)` is the cumulant-generating function
- `π(δ)` is the mixture prior

For practical purposes, we use a normal mixture prior `π ~ N(0, τ²)` and the closed-form expression for the resulting always-valid p-value.

### 3.2 The closed-form mSPRT statistic for binary outcomes

For a two-sample proportion test with `n1` users in control with `x1` conversions, and `n2` users in treatment with `x2` conversions, the always-valid p-value at any time t is:

```
p_av = 1 / Λ_t
```

where Λ_t is computed using a normal mixture prior. The closed-form derivation in the paper:

```python
import math

def msprt_p_value(x1: int, n1: int, x2: int, n2: int, tau: float = 0.1) -> float:
    """
    Always-valid p-value via mSPRT with normal mixture prior N(0, tau²).
    
    Args:
        x1, n1: control conversions and sample size
        x2, n2: treatment conversions and sample size
        tau: prior standard deviation on the effect size (default 0.1)
    
    Returns:
        Always-valid p-value. Unlike a classical p-value, this can be checked
        repeatedly during an experiment without inflating Type I error.
    
    Reference: Johari, Pekelis, Walsh (2015). "Always Valid Inference: Continuous
    Monitoring of A/B Tests."
    """
    if n1 == 0 or n2 == 0:
        return 1.0
    
    p1 = x1 / n1
    p2 = x2 / n2
    
    # Pooled variance estimator
    pooled_p = (x1 + x2) / (n1 + n2)
    s2 = pooled_p * (1 - pooled_p) * (1/n1 + 1/n2)
    
    if s2 <= 1e-12:
        return 1.0
    
    # Effective sample size
    n_eff = (n1 * n2) / (n1 + n2)
    
    # Observed effect
    delta_hat = p2 - p1
    
    # mSPRT likelihood ratio under normal mixture prior N(0, tau²)
    # Λ = sqrt(s2 / (s2 + n_eff * tau²)) * exp(0.5 * delta_hat² * n_eff² * tau² / (s2 * (s2 + n_eff * tau²)))
    
    denom = s2 + n_eff * tau * tau
    log_lambda = (
        0.5 * math.log(s2 / denom) +
        0.5 * (delta_hat ** 2) * (n_eff ** 2) * (tau ** 2) / (s2 * denom)
    )
    
    # Always-valid p-value = 1/Λ, capped at 1
    p_av = math.exp(-log_lambda)
    return min(1.0, p_av)


def msprt_should_stop(p_av: float, alpha: float = 0.05) -> bool:
    """
    Returns True if the always-valid p-value crosses the stopping threshold.
    """
    return p_av < alpha
```

### 3.3 Choice of tau (prior standard deviation)

The hyperparameter τ controls how much weight the prior puts on small vs large effects. Convention:

- `τ = 0.1` for typical conversion-rate experiments (effect sizes 1-15%)
- `τ = 0.05` for smaller-effect experiments
- `τ = 0.2` for larger-effect experiments

Use 0.1 as the default. Document this choice in a comment.

### 3.4 Aggregator handler — integrate mSPRT

In `dashboard/lambdas/aggregator/handler.py`, after computing the regular z-test and CUPED-adjusted stats, also compute the mSPRT always-valid p-value and store it on the Stats item:

```python
# Compute mSPRT always-valid p-value for binary outcomes
from stats.sequential import msprt_p_value, msprt_should_stop

p_av = msprt_p_value(x1=conversions_control, n1=n_control,
                      x2=conversions_treatment, n2=n_treatment)
should_stop = msprt_should_stop(p_av)

# Add to Stats item
stats_item["msprt_p_value"] = p_av
stats_item["msprt_should_stop"] = should_stop
```

### 3.5 Unit tests for mSPRT

In `dashboard/lambdas/aggregator/tests/test_sequential.py`:

```python
from stats.sequential import msprt_p_value, msprt_should_stop


def test_zero_effect_high_p_value():
    """With identical conversion rates, mSPRT p-value should stay high."""
    # 5% conversion rate in both
    p_av = msprt_p_value(x1=500, n1=10000, x2=500, n2=10000, tau=0.1)
    assert p_av > 0.5, f"Expected p_av > 0.5 for null effect, got {p_av}"


def test_large_effect_low_p_value():
    """With a large effect, mSPRT p-value should be small (significant)."""
    # 5% vs 10% — large effect, large sample
    p_av = msprt_p_value(x1=500, n1=10000, x2=1000, n2=10000, tau=0.1)
    assert p_av < 0.01, f"Expected p_av < 0.01 for large effect, got {p_av}"


def test_small_sample_caution():
    """With small samples, p-value should be high even for observed effects."""
    # 5% vs 10% but n=20 each — too small to be sure
    p_av = msprt_p_value(x1=1, n1=20, x2=2, n2=20, tau=0.1)
    assert p_av > 0.05, f"Expected p_av > 0.05 with small samples, got {p_av}"


def test_zero_sample_returns_one():
    """Edge case: empty samples should return p=1.0."""
    p_av = msprt_p_value(x1=0, n1=0, x2=0, n2=0, tau=0.1)
    assert p_av == 1.0


def test_msprt_always_valid_property():
    """
    Critical property: mSPRT should NOT cross threshold by chance even when peeked at often.
    Under the null (no effect), the false-positive rate should stay near α regardless of peeking.
    """
    import random
    random.seed(42)
    
    # Simulate 100 experiments under the null
    false_positives = 0
    for _ in range(100):
        n_peeks_with_significance = 0
        x1, x2 = 0, 0
        for trial in range(1, 5001):
            # True conversion rate = 5% for both (no effect)
            if random.random() < 0.05:
                x1 += 1
            if random.random() < 0.05:
                x2 += 1
            
            if trial >= 100 and trial % 50 == 0:
                # Peek at p-value at frequent intervals
                p_av = msprt_p_value(x1, trial, x2, trial, tau=0.1)
                if p_av < 0.05:
                    n_peeks_with_significance += 1
                    break
        
        if n_peeks_with_significance > 0:
            false_positives += 1
    
    # Under the null, the always-valid p-value should give us approximately
    # alpha = 5% false positives even with peeking. With 100 simulations,
    # expect somewhere around 0-15 false positives (one-sided binomial CI).
    assert false_positives <= 15, f"Too many false positives ({false_positives}/100), mSPRT may be broken"
```

The last test is the most important one. Classical p-values would give you ~80%+ false positives when peeked at this often. mSPRT should stay near the 5% nominal rate.

---

## 4. Dashboard updates

### 4.1 Update `/api/experiments/[id]/results/route.ts`

Update the results endpoint to include CUPED and mSPRT outputs:

```ts
return Response.json({
  experiment: {...},
  variants: [
    {
      name: "control",
      n: 4823,
      conversions: 192,
      conversion_rate: 0.0398,
      mean: 0.0398,
      variance: 0.0383,
      // NEW:
      cuped_adjusted_mean: 0.0395,  // very slightly different
      cuped_adjusted_variance: 0.0265,  // reduced
      variance_reduction_pct: 30.8,  // computed: (0.0383 - 0.0265) / 0.0383
    },
    ...
  ],
  lift: 0.236,
  lift_ci: [0.054, 0.418],
  cuped_lift_ci: [0.094, 0.378],  // tighter than the unadjusted CI
  p_value: 0.011,
  msprt_p_value: 0.018,  // always-valid version
  msprt_should_stop: true,
  is_significant: true,
  srm_flag: null,
  ...
});
```

Read the new Stats items from DynamoDB to populate these. If CUPED isn't enabled for an experiment, omit the cuped_* fields.

### 4.2 Update the experiment detail page

Add two new card sections to the experiment detail page:

**Section 1: CUPED Variance Reduction**

A card titled "Variance Reduction (CUPED)" showing:
- "Adjusted using pre-experiment activity covariate"
- A "before/after" CI comparison:
  - "Before CUPED: 95% CI [+5.4%, +41.8%]"
  - "After CUPED: 95% CI [+9.4%, +37.8%]" (narrower)
- The variance reduction percentage with a small color-coded indicator: "30.8% variance reduction"
- A footnote: "CUPED uses pre-experiment data to remove variance unrelated to treatment effects (Deng, Xu, Kohavi, Walker 2013)."

**Section 2: Sequential Testing (mSPRT)**

A card titled "Always-Valid Inference (mSPRT)" showing:
- "Always-valid p-value: 0.018"
- "Classical p-value: 0.011 (only valid at pre-specified sample size)"
- A status indicator:
  - If `msprt_should_stop = true`: green "✓ Safe to stop"
  - Otherwise: yellow "Continue collecting data"
- A footnote: "Unlike classical p-values, this remains valid no matter how often you peek (Johari, Pekelis, Walsh 2015)."

Both cards go above the regular Stats cards (i.e., near the top of the detail page).

### 4.3 Dashboard UX small touches

In the experiments list at `/experiments`:

Add a small column next to the existing p-value column:
- "Sequential" — shows the always-valid p-value, or "—" if mSPRT not computed yet
- Color: green if `msprt_should_stop = true` and the effect is positive, red if negative, gray otherwise

Don't redesign the whole table. Just add the one column.

---

## 5. Definition of done

Before declaring this phase complete, verify:

1. ✅ `python -m pytest dashboard/lambdas/aggregator/tests/ -v` shows 20+ tests passing (added ~6 new tests across CUPED and mSPRT)
2. ✅ `dashboard/lambdas/aggregator/deploy.sh` succeeds, function code updated in AWS
3. ✅ After deploy, trigger a single event from the headphones site, wait 30s, then check DynamoDB — should see new STATS#cuped#* items appearing
4. ✅ Dashboard at `/experiments/hero_cta_test` shows the CUPED card with a variance reduction percentage
5. ✅ Dashboard shows the mSPRT card with an always-valid p-value
6. ✅ `npm run build` in dashboard/ succeeds
7. ✅ No new errors in Vercel logs after deploying

### Important note on synthetic data

The existing synthetic data was generated without a pre-experiment covariate. To make CUPED actually work meaningfully, the generator needs to include the `pre_experiment_activity` field. Three options:

**Option A** — Add the covariate to the generator, regenerate all data. Takes ~5 minutes.

**Option B** — Add the covariate to the generator and the aggregator, but use a synthetic per-user covariate generated from the user_id hash for old events. This means existing events get a deterministic covariate retroactively. Slightly hacky but no regeneration needed.

**Option C** — Skip the variance reduction demo on existing data; only show CUPED working on new events that come in after deployment. The dashboard would show "CUPED enabled" but the variance reduction percentage might be near 0% until enough new events accumulate.

Recommend **Option A** — cleanest, takes 5 minutes, gives the demo video meaningful numbers.

---

## 6. Order of execution

1. **CUPED implementation first** — Add `stats/cuped.py`, write tests, run tests, verify they pass
2. **Update the generator** to add `pre_experiment_activity` covariate field (Option A)
3. **Update the handler** to compute CUPED-adjusted stats per experiment
4. **Deploy the Lambda** and verify in DynamoDB that CUPED stats items appear
5. **mSPRT implementation** — Add `stats/sequential.py`, write tests, run tests
6. **Update the handler** to compute mSPRT p-values
7. **Re-deploy the Lambda**
8. **Update the dashboard** results endpoint + detail page
9. **Push, wait for Vercel auto-deploy, verify visually**

Don't try to do all of this in parallel — incremental testing at each step catches bugs early.

---

## 7. When done

Show me:

1. List of all files created or modified
2. Output of `python -m pytest dashboard/lambdas/aggregator/tests/ -v`
3. Output of running the deploy.sh
4. Sample CloudWatch log entry showing the Lambda computing CUPED + mSPRT (paste 10-20 lines)
5. Screenshot of the experiment detail page showing the new CUPED card and mSPRT card
6. Screenshot of the experiments list with the new Sequential column
7. Specifically for `nav_layout_test` — does the CUPED + mSPRT data display correctly even though the SRM banner is showing? It should — these statistical methods still compute, but the SRM banner already warns the user the results are untrustworthy.

If anything fails or you hit a wall, stop and tell me. Don't paper over with workarounds.

---

Begin. Read this whole document first, then execute Section 2 → Section 3 → Section 4 in order.
