"""Sample Ratio Mismatch (SRM) detection via chi-squared test."""
from scipy.stats import chisquare


def srm_check(
    observed_counts: dict[str, int],
    expected_proportions: dict[str, float],
    alpha: float = 0.001,
) -> tuple[float, float, bool]:
    """
    Chi-squared test for sample ratio mismatch.

    observed_counts: {"control": 5234, "treatment": 4766}
    expected_proportions: {"control": 0.5, "treatment": 0.5}
    alpha: significance level for SRM detection (default 0.001 — conservative)

    Returns: (chi2_stat, p_value, is_srm)
    """
    total = sum(observed_counts.values())
    if total == 0:
        return 0.0, 1.0, False

    variants = list(observed_counts.keys())
    observed = [observed_counts[v] for v in variants]
    expected = [expected_proportions.get(v, 1.0 / len(variants)) * total for v in variants]

    chi2, p_value = chisquare(observed, expected)
    return float(chi2), float(p_value), bool(p_value < alpha)
