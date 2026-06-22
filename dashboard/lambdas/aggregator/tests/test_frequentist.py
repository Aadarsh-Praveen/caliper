"""Unit tests for frequentist statistics module."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from stats.frequentist import two_proportion_z_test, welch_t_test

# scipy is used here only as a reference oracle. The production stats module
# no longer imports scipy; these checks guard mathematical correctness.
try:
    from scipy.stats import norm as _scipy_norm, t as _scipy_t, chi2 as _scipy_chi2
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False


def test_two_proportion_z_not_significant_small_n():
    # 100/100 split, 50% vs 60% conversion — not significant at n=100
    # Reference: pooled p=0.55, se=sqrt(0.55*0.45*(1/100+1/100))=0.0703, z=1.422, p≈0.155
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=50, n1=100, x2=60, n2=100)
    if _HAS_SCIPY:
        scipy_p = 2 * (1 - _scipy_norm.cdf(abs(z)))
        assert abs(p - scipy_p) < 1e-4, f"p={p} vs scipy={scipy_p}"
    assert abs(lift - 0.10) < 1e-6
    assert p > 0.05  # not significant at n=100
    assert ci_low < lift < ci_high


def test_two_proportion_z_significant_large_n():
    # 1000/1000 split, 10% vs 20% conversion — clearly significant
    # pooled=0.15, se=sqrt(0.15*0.85*0.002)=0.01596, z=0.10/0.01596≈6.27, p≈3.7e-10
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=100, n1=1000, x2=200, n2=1000)
    if _HAS_SCIPY:
        scipy_p = 2 * (1 - _scipy_norm.cdf(abs(z)))
        assert abs(p - scipy_p) < 1e-4, f"p={p} vs scipy={scipy_p}"
    assert abs(lift - 0.10) < 1e-6
    assert p < 0.001
    assert lift > 0
    assert ci_low < lift < ci_high


def test_two_proportion_z_lift_direction():
    # Treatment worse than control → negative lift
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=60, n1=100, x2=40, n2=100)
    assert lift < 0


def test_two_proportion_z_zero_n():
    # Invalid inputs return None
    result = two_proportion_z_test(x1=0, n1=0, x2=10, n2=100)
    assert result == (None, None, None, None, None)


def test_two_proportion_z_identical_rates():
    # Same conversion rate → z ≈ 0, p ≈ 1
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=50, n1=100, x2=50, n2=100)
    if _HAS_SCIPY:
        scipy_p = 2 * (1 - _scipy_norm.cdf(abs(z)))
        assert abs(p - scipy_p) < 1e-4, f"p={p} vs scipy={scipy_p}"
    assert abs(z) < 1e-6
    assert p > 0.99
    assert abs(lift) < 1e-6


def test_welch_t_test_significant():
    # mean1=10, mean2=12, both with var=4, n=200 — should be highly significant
    # t = (12-10) / sqrt(4/200 + 4/200) = 2 / sqrt(0.04) = 2/0.2 = 10
    t_stat, df, p_value, lift, ci_low, ci_high = welch_t_test(
        mean1=10.0, var1=4.0, n1=200,
        mean2=12.0, var2=4.0, n2=200,
    )
    if _HAS_SCIPY:
        scipy_p = float(2 * _scipy_t.sf(abs(t_stat), df))
        scipy_margin = float(_scipy_t.ppf(0.975, df)) * (4.0 / 200 + 4.0 / 200) ** 0.5
        assert abs(p_value - scipy_p) < 1e-4, f"p={p_value} vs scipy={scipy_p}"
        assert abs((ci_high - ci_low) - 2 * scipy_margin) < 1e-3
    assert abs(lift - 2.0) < 1e-6
    assert t_stat > 9.0
    assert p_value < 0.001


def test_welch_t_test_zero_variance():
    # Zero variance → invalid
    result = welch_t_test(mean1=10.0, var1=0.0, n1=100, mean2=12.0, var2=1.0, n2=100)
    assert result == (None, None, None, None, None, None)


def test_welch_t_test_small_n():
    # n=1 → invalid
    result = welch_t_test(mean1=10.0, var1=4.0, n1=1, mean2=12.0, var2=4.0, n2=100)
    assert result == (None, None, None, None, None, None)


def test_normal_cdf_agrees_with_scipy():
    """Pure-Python normal CDF vs scipy to 1e-4 across a wide z range."""
    if not _HAS_SCIPY:
        return
    from stats.frequentist import _normal_cdf
    for z in [-3.5, -2.0, -1.0, 0.0, 1.0, 1.96, 2.576, 3.0, 3.5]:
        ours = _normal_cdf(z)
        ref = float(_scipy_norm.cdf(z))
        assert abs(ours - ref) < 1e-4, f"z={z}: ours={ours} scipy={ref}"


def test_t_sf_agrees_with_scipy():
    """Pure-Python t-distribution SF vs scipy to 1e-4."""
    if not _HAS_SCIPY:
        return
    from stats.frequentist import _t_sf_two_tail
    for t_abs, df in [(1.0, 5), (2.0, 10), (2.0, 30), (3.0, 50), (5.0, 200)]:
        ours = _t_sf_two_tail(t_abs, df)
        ref = float(2 * _scipy_t.sf(t_abs, df))
        assert abs(ours - ref) < 1e-4, f"t={t_abs} df={df}: ours={ours} scipy={ref}"
