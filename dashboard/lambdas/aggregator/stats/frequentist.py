"""Frequentist statistics for A/B test analysis."""
from scipy.stats import norm, t as t_dist


def two_proportion_z_test(
    x1: int, n1: int, x2: int, n2: int
) -> tuple[float, float, float, float, float] | tuple[None, None, None, None, None]:
    """
    Two-proportion z-test (treatment minus control).

    Returns: (z_stat, p_value, lift, ci_low, ci_high)
      lift = p2 - p1 (absolute difference, treatment minus control)
      ci is 95% Wald interval on the difference
    Returns all-None tuple if inputs are invalid.
    """
    if n1 < 1 or n2 < 1:
        return None, None, None, None, None

    p1 = x1 / n1
    p2 = x2 / n2
    pooled_p = (x1 + x2) / (n1 + n2)
    se_pooled = (pooled_p * (1 - pooled_p) * (1 / n1 + 1 / n2)) ** 0.5

    if se_pooled == 0:
        return None, None, None, None, None

    z = (p2 - p1) / se_pooled
    p_value = 2 * (1 - norm.cdf(abs(z)))

    # Wald CI on the absolute difference
    se_unpooled = (p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2) ** 0.5
    lift = p2 - p1
    ci_low = lift - 1.96 * se_unpooled
    ci_high = lift + 1.96 * se_unpooled

    return z, p_value, lift, ci_low, ci_high


def welch_t_test(
    mean1: float,
    var1: float,
    n1: int,
    mean2: float,
    var2: float,
    n2: int,
) -> tuple[float, float, float, float, float, float] | tuple[None, None, None, None, None, None]:
    """
    Welch's t-test for continuous metrics with unequal variances.
    Uses Satterthwaite approximation for degrees of freedom.

    Returns: (t_stat, df, p_value, lift, ci_low, ci_high)
    Returns all-None if variance is zero or n < 2.
    """
    if n1 < 2 or n2 < 2 or var1 <= 0 or var2 <= 0:
        return None, None, None, None, None, None

    se1_sq = var1 / n1
    se2_sq = var2 / n2
    se = (se1_sq + se2_sq) ** 0.5

    if se == 0:
        return None, None, None, None, None, None

    lift = mean2 - mean1
    t_stat = lift / se

    # Satterthwaite degrees of freedom
    df = (se1_sq + se2_sq) ** 2 / (se1_sq ** 2 / (n1 - 1) + se2_sq ** 2 / (n2 - 1))

    p_value = 2 * t_dist.sf(abs(t_stat), df)

    ci_margin = t_dist.ppf(0.975, df) * se
    ci_low = lift - ci_margin
    ci_high = lift + ci_margin

    return t_stat, df, p_value, lift, ci_low, ci_high
