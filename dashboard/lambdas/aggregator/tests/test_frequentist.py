"""Unit tests for frequentist statistics module."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from stats.frequentist import two_proportion_z_test, welch_t_test


def test_two_proportion_z_not_significant_small_n():
    # 100/100 split, 50% vs 60% conversion — not significant at n=100
    # Reference: pooled p=0.55, se=sqrt(0.55*0.45*(1/100+1/100))=0.0703, z=1.422, p≈0.155
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=50, n1=100, x2=60, n2=100)
    assert abs(lift - 0.10) < 1e-6
    assert p > 0.05  # not significant at n=100
    assert ci_low < lift < ci_high


def test_two_proportion_z_significant_large_n():
    # 1000/1000 split, 10% vs 20% conversion — clearly significant
    # pooled=0.15, se=sqrt(0.15*0.85*0.002)=0.01596, z=0.10/0.01596≈6.27, p≈3.7e-10
    z, p, lift, ci_low, ci_high = two_proportion_z_test(x1=100, n1=1000, x2=200, n2=1000)
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
