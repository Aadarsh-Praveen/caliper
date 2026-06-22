"""Sample Ratio Mismatch (SRM) detection via chi-squared test — pure Python, no scipy."""
import math


# ---------------------------------------------------------------------------
# Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a)
# Gives the chi-squared survival function: P(χ²(df) > c) = Q(df/2, c/2)
# ---------------------------------------------------------------------------

def _gammaincl_series(a: float, x: float) -> float:
    """Lower regularized incomplete gamma P(a, x) via series expansion."""
    # P(a, x) = e^(-x) * x^a / Γ(a) * Σ_{k=0}^∞ x^k / (a+1)(a+2)...(a+k)
    log_factor = -x + a * math.log(x) - math.lgamma(a)
    term = 1.0 / a
    s = term
    for k in range(1, 300):
        term *= x / (a + k)
        s += term
        if abs(term) < 1e-15 * abs(s):
            break
    return math.exp(log_factor) * s


def _gammaincc_cf(a: float, x: float) -> float:
    """Upper regularized incomplete gamma Q(a, x) via continued fraction (Lentz's method)."""
    TINY = 1e-300
    log_factor = -x + a * math.log(x) - math.lgamma(a)
    b = x + 1.0 - a
    c = 1.0 / TINY
    d = 1.0 / b if abs(b) > TINY else 1.0 / TINY
    h = d
    for k in range(1, 300):
        an = -k * (k - a)
        b += 2.0
        d = an * d + b
        if abs(d) < TINY:
            d = TINY
        c = b + an / c
        if abs(c) < TINY:
            c = TINY
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-13:
            break
    return math.exp(log_factor) * h


def _gammaincc(a: float, x: float) -> float:
    """
    Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a).

    Chi-squared p-value: P(χ²(df) > c) = Q(df/2, c/2) = _gammaincc(df/2, c/2).
    Uses series for small x, continued fraction for large x (same split as scipy).
    """
    if x <= 0.0:
        return 1.0
    if x < a + 1.0:
        # Upper = 1 - Lower; use series for the lower gamma
        return 1.0 - _gammaincl_series(a, x)
    return _gammaincc_cf(a, x)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def srm_check(
    observed_counts: "dict[str, int]",
    expected_proportions: "dict[str, float]",
    alpha: float = 0.001,
) -> "tuple[float, float, bool]":
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

    chi2 = sum(
        (o - e) ** 2 / e
        for o, e in zip(observed, expected)
        if e > 0
    )
    df = len(variants) - 1
    if df <= 0:
        return float(chi2), 1.0, False

    # P(χ²(df) > chi2) = Q(df/2, chi2/2)
    p_value = _gammaincc(df / 2.0, chi2 / 2.0)
    return float(chi2), float(p_value), bool(p_value < alpha)
