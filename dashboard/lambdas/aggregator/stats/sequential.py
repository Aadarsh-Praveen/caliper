"""
mSPRT (mixture Sequential Probability Ratio Test) — always-valid p-values.

Reference: Johari, Pekelis, Walsh (2015). "Always Valid Inference: Continuous
Monitoring of A/B Tests."

Unlike classical p-values, mSPRT p-values remain valid regardless of how often
you peek at the data during an experiment — no alpha inflation from optional stopping.
"""
import math


def msprt_p_value(x1: int, n1: int, x2: int, n2: int, tau: float = 0.1) -> float:
    """
    Always-valid p-value via mSPRT with normal mixture prior N(0, tau²).

    Args:
        x1, n1: control conversions and sample size
        x2, n2: treatment conversions and sample size
        tau: prior standard deviation on the effect size (default 0.1).
             Convention: 0.1 for typical conversion-rate experiments (1-15% effects),
             0.05 for smaller-effect experiments, 0.2 for larger effects.

    Returns:
        Always-valid p-value. Unlike a classical p-value, this can be checked
        repeatedly during an experiment without inflating Type I error.
    """
    if n1 == 0 or n2 == 0:
        return 1.0

    p1 = x1 / n1
    p2 = x2 / n2

    # Pooled variance estimator
    pooled_p = (x1 + x2) / (n1 + n2)
    s2 = pooled_p * (1 - pooled_p) * (1 / n1 + 1 / n2)

    if s2 <= 1e-12:
        return 1.0

    # Observed effect
    delta_hat = p2 - p1

    # mSPRT likelihood ratio under normal mixture prior N(0, tau²).
    # We treat delta_hat ~ N(delta, s2) as a single sufficient observation.
    # Integrating the Gaussian mixture gives the Bayes factor:
    #   Λ = sqrt(s2 / (s2 + tau²)) * exp(delta_hat² * tau² / (2 * s2 * (s2 + tau²)))
    # This is an always-valid test: Pr(1/Λ < alpha | H₀) ≤ alpha at every peek
    # because E[Λ | H₀] = 1 (Bayes factor property under the null).
    denom = s2 + tau * tau
    log_lambda = (
        0.5 * math.log(s2 / denom)
        + 0.5 * (delta_hat ** 2) * (tau ** 2) / (s2 * denom)
    )

    # Always-valid p-value = 1/Λ, capped at 1
    p_av = math.exp(-log_lambda)
    return min(1.0, p_av)


def msprt_should_stop(p_av: float, alpha: float = 0.05) -> bool:
    """
    Returns True if the always-valid p-value crosses the stopping threshold.
    """
    return p_av < alpha
