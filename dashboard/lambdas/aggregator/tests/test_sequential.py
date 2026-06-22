"""Unit tests for mSPRT sequential testing module."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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
