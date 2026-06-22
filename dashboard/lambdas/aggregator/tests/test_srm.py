"""Unit tests for SRM detection module."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from stats.srm import srm_check

# scipy used here only as a reference oracle — not imported in production code.
try:
    from scipy.stats import chisquare as _scipy_chisquare
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False


def _scipy_srm(observed_counts, expected_proportions, alpha=0.001):
    """Run the same test via scipy for cross-checking."""
    total = sum(observed_counts.values())
    variants = list(observed_counts.keys())
    observed = [observed_counts[v] for v in variants]
    expected = [expected_proportions.get(v, 1.0 / len(variants)) * total for v in variants]
    chi2, p = _scipy_chisquare(observed, expected)
    return float(chi2), float(p), bool(p < alpha)


def test_srm_no_mismatch_perfect_split():
    # Exactly 50/50 → no SRM
    chi2, p, is_srm = srm_check(
        {"control": 5000, "treatment": 5000},
        {"control": 0.5, "treatment": 0.5},
    )
    if _HAS_SCIPY:
        ref_chi2, ref_p, _ = _scipy_srm({"control": 5000, "treatment": 5000}, {"control": 0.5, "treatment": 0.5})
        assert abs(chi2 - ref_chi2) < 1e-4, f"chi2={chi2} vs scipy={ref_chi2}"
        assert abs(p - ref_p) < 1e-4, f"p={p} vs scipy={ref_p}"
    assert not is_srm
    assert abs(chi2) < 1e-6
    assert p > 0.99


def test_srm_detected_60_40_skew():
    # 60/40 split expected 50/50 — SRM should be flagged at n=10000
    # Expected: chi2 = (1000^2/5000 + 1000^2/5000) = 200 + 200 = 400, p ≈ 0
    chi2, p, is_srm = srm_check(
        {"control": 6000, "treatment": 4000},
        {"control": 0.5, "treatment": 0.5},
    )
    if _HAS_SCIPY:
        ref_chi2, ref_p, _ = _scipy_srm({"control": 6000, "treatment": 4000}, {"control": 0.5, "treatment": 0.5})
        assert abs(chi2 - ref_chi2) < 1e-4, f"chi2={chi2} vs scipy={ref_chi2}"
        assert abs(p - ref_p) < 1e-4, f"p={p} vs scipy={ref_p}"
    assert is_srm
    assert chi2 > 300
    assert p < 0.001


def test_srm_borderline_not_detected():
    # Slight imbalance at low n — should NOT trigger SRM (alpha=0.001)
    chi2, p, is_srm = srm_check(
        {"control": 55, "treatment": 45},
        {"control": 0.5, "treatment": 0.5},
    )
    if _HAS_SCIPY:
        ref_chi2, ref_p, _ = _scipy_srm({"control": 55, "treatment": 45}, {"control": 0.5, "treatment": 0.5})
        assert abs(chi2 - ref_chi2) < 1e-4
        assert abs(p - ref_p) < 1e-4
    assert not is_srm  # p ≈ 0.16 at n=100, well above 0.001


def test_srm_empty_counts():
    chi2, p, is_srm = srm_check({}, {"control": 0.5, "treatment": 0.5})
    assert not is_srm
    assert chi2 == 0.0


def test_srm_three_variants():
    # 3-way even split, one variant under-represented
    # Expected: control 1000, treatment_a 1000, treatment_b 667 with equal expected
    chi2, p, is_srm = srm_check(
        {"control": 1000, "treatment_a": 1000, "treatment_b": 667},
        {"control": 1 / 3, "treatment_a": 1 / 3, "treatment_b": 1 / 3},
    )
    if _HAS_SCIPY:
        ref_chi2, ref_p, _ = _scipy_srm(
            {"control": 1000, "treatment_a": 1000, "treatment_b": 667},
            {"control": 1 / 3, "treatment_a": 1 / 3, "treatment_b": 1 / 3},
        )
        assert abs(chi2 - ref_chi2) < 1e-4
        assert abs(p - ref_p) < 1e-4
    assert is_srm
    assert chi2 > 10


def test_srm_custom_alpha():
    # At small n, a 52/48 split should NOT trigger SRM at strict alpha=0.001
    # chi2 = (2^2/50 + 2^2/50) = 0.08 + 0.08 = 0.16, p ≈ 0.69
    chi2, p, is_srm = srm_check(
        {"control": 52, "treatment": 48},
        {"control": 0.5, "treatment": 0.5},
        alpha=0.001,
    )
    if _HAS_SCIPY:
        ref_chi2, ref_p, _ = _scipy_srm({"control": 52, "treatment": 48}, {"control": 0.5, "treatment": 0.5})
        assert abs(chi2 - ref_chi2) < 1e-4
        assert abs(p - ref_p) < 1e-4
    assert not is_srm
    assert chi2 < 1.0
    assert p > 0.5
