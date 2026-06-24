"""
Frequentist statistics for A/B test analysis — pure Python, no scipy.

Provides two-proportion z-test and Welch's t-test for the aggregator Lambda.
All normal and t-distribution computations use math.erf and the AS241 rational
approximation (Wichura 1988) so the module runs without scipy in the Lambda
environment, where the AWSSDKPandas layer does not include scipy.

Reference: Wichura (1988) "Algorithm AS241: The Percentage Points of the Normal
Distribution." Applied Statistics 37(3), 477–484.
"""
import math


# ---------------------------------------------------------------------------
# Normal distribution
# ---------------------------------------------------------------------------

def _normal_cdf(z: float) -> float:
    """
    Compute the standard normal CDF Φ(z).

    Uses math.erf, which provides C library precision (~10^-15 accuracy).
    This replaces scipy.stats.norm.cdf to eliminate the scipy dependency from
    the Lambda runtime.

    Args:
        z: Standard normal z-score.

    Returns:
        P(Z ≤ z) where Z ~ N(0, 1), in the range [0, 1].
    """
    return (1.0 + math.erf(z / math.sqrt(2.0))) / 2.0


def _normal_ppf(p: float) -> float:
    """
    Inverse of the standard normal CDF — given a probability, return the z-score.

    Implements the AS241 algorithm (Wichura 1988), a rational polynomial approximation
    accurate to ~10^-9 over the full range (0, 1). Pure Python, no scipy.

    Args:
        p: Probability in (0, 1).

    Returns:
        The z such that Φ(z) = p.
    """
    # Coefficients for the central region |p - 0.5| <= 0.425
    a = (
        3.3871328727963666080e+00, 1.3314166789178437745e+02,
        1.9715909503065514427e+03, 1.3731693765509461125e+04,
        4.5921953931549871457e+04, 6.7265770927008700853e+04,
        3.3430575583588128105e+04, 2.5090809287301226727e+03,
    )
    b = (
        1.0,                       4.2313330701600911252e+01,
        6.8718700749205790830e+02, 5.3941960214247511077e+03,
        2.1213794301586595867e+04, 3.9307895800092710610e+04,
        2.8729085735721942674e+04, 5.2264952788528545610e+03,
    )
    # Coefficients for tails when r in [1.6, 5]
    c = (
        1.42343711074721209650e+00, 4.63033784615654529590e+00,
        5.76949722146864628717e+00, 3.64784832476320460504e+00,
        1.27045825245236838258e+00, 2.41780725177450611770e-01,
        2.27001535109994502416e-02, 7.74545433090521994232e-04,
    )
    d = (
        1.0,                       2.05319162663775882187e+00,
        1.67638483950684064056e+00, 6.89767334985100004550e-01,
        1.48103976427480074590e-01, 1.51986665636164571966e-02,
        5.47593808499534494600e-04, 1.05075007164441684324e-09,
    )
    # Coefficients for extreme tails when r > 5
    e = (
        6.65790464350110377720e+00, 5.46378491116411436990e+00,
        1.78482653991729133580e+00, 2.96560571828504891230e-01,
        2.65321895265761230930e-02, 1.24266094738807843860e-03,
        2.71155556874348757815e-05, 2.01033439929228813265e-07,
    )
    f = (
        1.0,                       5.99832206555887937690e-01,
        1.36929880922735805310e-01, 1.48753612908506508940e-02,
        7.86869131145613259100e-04, 1.84631831751005468180e-05,
        1.42151175831644588870e-07, 2.04426310338993978564e-15,
    )

    q = p - 0.5
    if abs(q) <= 0.425:
        r = 0.180625 - q * q
        num = ((((((a[7]*r+a[6])*r+a[5])*r+a[4])*r+a[3])*r+a[2])*r+a[1])*r+a[0]
        den = ((((((b[7]*r+b[6])*r+b[5])*r+b[4])*r+b[3])*r+b[2])*r+b[1])*r+b[0]
        return q * num / den

    r = math.sqrt(-math.log(0.5 - abs(q)))
    if r <= 5.0:
        r -= 1.6
        num = ((((((c[7]*r+c[6])*r+c[5])*r+c[4])*r+c[3])*r+c[2])*r+c[1])*r+c[0]
        den = ((((((d[7]*r+d[6])*r+d[5])*r+d[4])*r+d[3])*r+d[2])*r+d[1])*r+d[0]
    else:
        r -= 5.0
        num = ((((((e[7]*r+e[6])*r+e[5])*r+e[4])*r+e[3])*r+e[2])*r+e[1])*r+e[0]
        den = ((((((f[7]*r+f[6])*r+f[5])*r+f[4])*r+f[3])*r+f[2])*r+f[1])*r+f[0]

    return math.copysign(num / den, q)


# ---------------------------------------------------------------------------
# Incomplete beta function (for t-distribution)
# ---------------------------------------------------------------------------

def _lbeta(a: float, b: float) -> float:
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for betainc via Lentz's method (Numerical Recipes §6.4)."""
    TINY = 1e-300
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < TINY:
        d = TINY
    d = 1.0 / d
    h = d
    for m in range(1, 201):
        m2 = 2 * m
        # Even step
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < TINY:
            d = TINY
        c = 1.0 + aa / c
        if abs(c) < TINY:
            c = TINY
        d = 1.0 / d
        h *= d * c
        # Odd step
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < TINY:
            d = TINY
        c = 1.0 + aa / c
        if abs(c) < TINY:
            c = TINY
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-13:
            break
    return h


def _betainc(a: float, b: float, x: float) -> float:
    """Regularized lower incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_f = a * math.log(x) + b * math.log(1.0 - x) - _lbeta(a, b)
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(log_f) / a * _betacf(a, b, x)
    # Symmetry relation: I_x(a,b) = 1 - I_{1-x}(b,a)
    log_f2 = b * math.log(1.0 - x) + a * math.log(x) - _lbeta(b, a)
    return 1.0 - math.exp(log_f2) / b * _betacf(b, a, 1.0 - x)


# ---------------------------------------------------------------------------
# t-distribution helpers (for Welch's t-test)
# ---------------------------------------------------------------------------

def _t_sf_two_tail(t_abs: float, df: float) -> float:
    """
    Two-tailed p-value P(|T| > t_abs | df) for Student's t-distribution.
    Uses the exact regularized incomplete beta: P(|T| > t | df) = I_x(df/2, 1/2),
    where x = df/(df + t²). Accurate for all df ≥ 1.
    """
    if t_abs <= 0.0:
        return 1.0
    x = df / (df + t_abs * t_abs)
    return _betainc(df / 2.0, 0.5, x)


def _t_quantile(p: float, df: float) -> float:
    """
    t-distribution quantile for p ∈ (0.5, 1).
    Uses Newton's method starting from the normal approximation with the exact
    t-CDF via betainc. Converges to machine precision in ≤ 10 iterations.
    """
    # Newton's method: find t > 0 s.t. P(T ≤ t | df) = p.
    # CDF(t > 0) = 1 - _betainc(df/2, 0.5, df/(df+t²)) / 2
    t = _normal_ppf(p)  # accurate starting guess (normal approx)
    log_pdf_const = (
        math.lgamma((df + 1.0) / 2.0)
        - math.lgamma(df / 2.0)
        - 0.5 * math.log(math.pi * df)
    )
    for _ in range(20):
        x = df / (df + t * t)
        cdf_t = 1.0 - _betainc(df / 2.0, 0.5, x) / 2.0
        pdf_t = math.exp(log_pdf_const - (df + 1.0) / 2.0 * math.log(1.0 + t * t / df))
        delta = (cdf_t - p) / pdf_t
        t -= delta
        if abs(delta) < 1e-10:
            break
    return t


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def two_proportion_z_test(
    x1: int, n1: int, x2: int, n2: int
) -> "tuple[float, float, float, float, float] | tuple[None, None, None, None, None]":
    """
    Two-proportion z-test (treatment minus control) for binary metrics.

    Uses a pooled standard error for the z-statistic and an unpooled (Wald) standard
    error for the 95% confidence interval on the absolute difference, following the
    standard asymptotic approach for large samples.

    Args:
        x1: Control conversions.
        n1: Control sample size.
        x2: Treatment conversions.
        n2: Treatment sample size.

    Returns:
        Tuple (z_stat, p_value, lift, ci_low, ci_high) where lift = p2 - p1
        (absolute difference, treatment minus control) and ci is the 95% Wald interval.
        Returns a tuple of five Nones if inputs are invalid (n < 1 or se = 0).
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
    p_value = 2.0 * (1.0 - _normal_cdf(abs(z)))

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
) -> "tuple[float, float, float, float, float, float] | tuple[None, None, None, None, None, None]":
    """
    Welch's t-test for continuous metrics with unequal group variances.

    Uses the Satterthwaite approximation for effective degrees of freedom and an
    exact t-quantile (via betainc Newton solver) for the 95% CI — no normal approximation.
    Also used downstream for CUPED-adjusted binary metrics, where the CLT makes adjusted
    values approximately normal at large n.

    Args:
        mean1: Control sample mean.
        var1: Control sample variance (unbiased, ddof=1).
        n1: Control sample size.
        mean2: Treatment sample mean.
        var2: Treatment sample variance (unbiased, ddof=1).
        n2: Treatment sample size.

    Returns:
        Tuple (t_stat, df, p_value, lift, ci_low, ci_high) where lift = mean2 - mean1.
        Returns a tuple of six Nones if n < 2 or variance is zero.
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

    p_value = _t_sf_two_tail(abs(t_stat), df)
    ci_margin = _t_quantile(0.975, df) * se
    ci_low = lift - ci_margin
    ci_high = lift + ci_margin

    return t_stat, df, p_value, lift, ci_low, ci_high
