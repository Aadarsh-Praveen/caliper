"""
CUPED (Controlled-experiment Using Pre-Experiment Data) variance reduction.

Reference: Deng, Xu, Kohavi, Walker (2013).
"Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data"
"""
from typing import List, Tuple


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
