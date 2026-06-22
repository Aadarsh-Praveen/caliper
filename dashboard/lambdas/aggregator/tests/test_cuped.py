"""Unit tests for CUPED variance reduction module."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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
