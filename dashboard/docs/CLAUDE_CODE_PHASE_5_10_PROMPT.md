# Caliper Phase 5.10 — Code Cleanup Pass (web/ + dashboard/)

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root.**

---

## 0. Context

Light professional cleanup pass for both monorepo folders before hackathon submission. The codebase has grown organically across ~10 phases of development. Now we make it look intentional.

**In scope:**
- `.gitignore` files at root + per-folder, with proper patterns
- `requirements.txt` updates (Python — multiple files across Lambdas)
- `package.json` hygiene (TypeScript — clean up dev/prod dependencies)
- Docstrings on the most technically substantive Python functions
- JSDoc on the most substantive TypeScript modules
- Dead code removal (commented-out blocks, debug `console.log`, scratch files)
- Secret audit — verify nothing sensitive is committed
- File structure tidying (move scattered docs files to proper homes)

**Out of scope:**
- Top-level README.md (deferred to a separate phase)
- Refactoring working code
- Adding tests where none exist
- Changing function signatures or public APIs
- Restructuring folder layout
- Adding LICENSE/CONTRIBUTING/CODE_OF_CONDUCT files

## 1. Scope split

### web/ folder cleanup
Pure TypeScript/React. Caliper Arc Pro headphones demo site.

Files to focus on:
- `web/.gitignore`
- `web/package.json`
- `web/lib/caliper-sdk.ts` (or wherever the SDK lives — the SDK file is the most important code in web/)
- `web/components/CaliperDevPanel.tsx`
- `web/app/` route handlers
- Any utility files in `web/lib/`

### dashboard/ folder cleanup
Mixed TypeScript/Python. Caliper SaaS product.

Files to focus on:
- `dashboard/.gitignore`
- `dashboard/package.json`
- `dashboard/lambdas/aggregator/requirements.txt`
- `dashboard/lambdas/dbt-runner/requirements.txt`
- `dashboard/scripts/requirements.txt` (if exists; otherwise verify the venv requirements at root)

**TypeScript files to docstring** (most technically substantive):
- `dashboard/lib/bedrock.ts` (Bedrock client + prompt + parser)
- `dashboard/lib/experiment-results.ts` (shared results computation)
- `dashboard/lib/timeseries.ts` (SQL queries for charts)
- `dashboard/lib/postgres-batch.ts` (dual-write helpers)
- `dashboard/lib/postgres.ts` (connection pool)
- `dashboard/lib/dynamodb.ts` (single-table DynamoDB access)

**Python files to docstring** (most technically substantive):
- `dashboard/lambdas/aggregator/stats/frequentist.py` (z-test, Welch's t, pure Python normal CDF)
- `dashboard/lambdas/aggregator/stats/cuped.py` (CUPED variance reduction)
- `dashboard/lambdas/aggregator/stats/sequential.py` (mSPRT always-valid testing)
- `dashboard/lambdas/aggregator/stats/srm.py` (SRM detection)
- `dashboard/lambdas/aggregator/handler.py` (the Lambda entrypoint)
- `dashboard/lambdas/dbt-runner/handler.py` (the dbt Lambda)
- `dashboard/scripts/generate_demo_data.py` (the synthetic data generator)

## 2. Step-by-step

### Step 1 — Secret audit (do this FIRST)

Before any other changes, scan the entire repo for accidentally committed secrets:

```bash
cd ~/Documents/Projects/Hackathon/Caliper/caliper

# Search for common patterns of leaked secrets
grep -rn "Aadarsh1999" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" --include="*.md" --include="*.sh" --include="*.yml" --include="*.yaml" 2>/dev/null || true

grep -rn "AKIA" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" --include="*.md" --include="*.sh" --include="*.yml" --include="*.yaml" 2>/dev/null || true

grep -rn "sk-ant-" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" --include="*.md" --include="*.sh" --include="*.yml" --include="*.yaml" 2>/dev/null || true

grep -rn "password" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" --include="*.sh" --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v ".gitignore" | grep -v "node_modules" | head -50
```

For ANY hit, examine the file. If it's a real secret (Aurora password, AWS access key, API key), the user must rotate the credential. List every match found and ask the user to confirm whether each is intentional documentation or a leaked secret.

Note: if the user hasn't yet rotated the Aurora password mentioned in chat history (`Aadarsh1999`), flag this prominently and STOP. Do not proceed until the user confirms rotation.

### Step 2 — Build comprehensive .gitignore files

#### Step 2a — Root .gitignore (`caliper/.gitignore`)

Verify the root `.gitignore` includes:

```
# Environment
.env
.env.local
.env.*.local
.env.development
.env.production

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.venv/
venv/
ENV/
.Python
*.egg-info/
.pytest_cache/
.mypy_cache/
.coverage
htmlcov/

# Node
node_modules/
.next/
out/
build/
dist/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# AWS / Deployment
*.zip
.aws-sam/
.serverless/

# dbt
target/
dbt_packages/
logs/
.user.yml

# Output / temp
*.tmp
tmp/
.tmp/

# Local secrets (defense in depth)
secrets/
credentials.json
```

If the existing `.gitignore` already has most of these, add only what's missing. Don't duplicate.

#### Step 2b — web/.gitignore

Create or update `web/.gitignore` with the Next.js standard set:

```
# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
```

#### Step 2c — dashboard/.gitignore

Create or update `dashboard/.gitignore` with everything in `web/.gitignore` PLUS:

```
# Python (for the scripts/ and lambdas/ subdirs)
__pycache__/
*.py[cod]
.venv/
*.egg-info/

# dbt
analytics/target/
analytics/dbt_packages/
analytics/logs/
analytics/.user.yml

# Lambda build artifacts
lambdas/*/build/
lambdas/*/*.zip

# Docker
.docker/
```

### Step 3 — Update requirements.txt files

#### Step 3a — `dashboard/lambdas/aggregator/requirements.txt`

The aggregator Lambda uses ONLY the standard library (math, statistics) plus the AWSSDKPandas layer. The requirements.txt should be minimal:

```
# Lambda environment provides boto3 + numpy + pandas via the AWSSDKPandas-Python312-Arm64 layer.
# No external pip dependencies needed — all statistical computations are pure Python (math module only).
# This file is intentionally empty.
```

Verify the existing `requirements.txt` doesn't list scipy, statsmodels, or other packages we removed. Remove anything that's not actually imported.

#### Step 3b — `dashboard/lambdas/dbt-runner/requirements.txt`

The dbt-runner Lambda is containerized with dbt-core + dbt-postgres + psycopg2-binary. Should be:

```
dbt-core==1.8.0
dbt-postgres==1.8.0
psycopg2-binary==2.9.9
```

Pin exact versions for reproducibility. Verify these are what's currently in the Dockerfile installs.

#### Step 3c — Local development requirements

If there's a `requirements.txt` at the repo root or in `dashboard/scripts/`, it should list dependencies needed for the synthetic data generator and unit tests:

```
boto3>=1.34.0
psycopg[binary]>=3.1.0
numpy>=1.26.0
# Optional: scipy and statsmodels for unit test reference values
scipy>=1.11.0
statsmodels>=0.14.0
```

The scipy/statsmodels packages are only used in unit tests to verify the pure Python implementations produce equivalent values — they're not deployed to any Lambda.

If no such file exists, create `dashboard/requirements-dev.txt` for clarity.

### Step 4 — package.json hygiene

For both `web/package.json` and `dashboard/package.json`:

1. **Verify all dependencies are actually used.** Quick check:
   ```bash
   cd web   # or dashboard
   npx depcheck 2>/dev/null || echo "depcheck not available, manual review needed"
   ```
   If depcheck flags unused dependencies, remove them.

2. **Move build-only packages to devDependencies.** Items like `@types/*`, `eslint`, `typescript`, `postcss`, `tailwindcss` belong in devDependencies, not dependencies.

3. **Verify the package version numbers** are sensible (no caret `^` for breaking versions, no tilde `~` on things that need exact pinning like recharts).

Do NOT change package versions just for cleanliness. Only move things between dependencies/devDependencies, and remove genuinely unused entries.

### Step 5 — Python docstrings

For each Python file listed in the "Python files to docstring" section above, add module-level and function-level docstrings.

**Module-level docstring template** (top of each .py file):

```python
"""
<one-line module purpose>

<2-3 sentence description of what this module does, who calls it, and key algorithms used>

Reference: <paper/book/AWS doc URL if applicable>
"""
```

**Function-level docstring template** (under each def):

```python
def function_name(param1: Type, param2: Type) -> ReturnType:
    """
    <one-line summary in imperative mood>

    <2-4 sentence detailed explanation if non-trivial>

    Args:
        param1: <description>
        param2: <description>

    Returns:
        <description of return value>

    Raises:
        <ExceptionType>: <when this is raised, if relevant>
    """
```

Examples of the level of detail expected:

```python
# In dashboard/lambdas/aggregator/stats/frequentist.py
def _normal_cdf(z: float) -> float:
    """
    Compute the standard normal cumulative distribution function Φ(z).

    Uses Python's math.erf, which provides C library precision (~10^-15 accuracy).
    This replaces scipy.stats.norm.cdf to eliminate the scipy dependency from the
    Lambda runtime, since the AWSSDKPandas layer does not include scipy.

    Args:
        z: Standard normal z-score.

    Returns:
        P(Z <= z) where Z ~ N(0, 1). In the range [0, 1].
    """
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _normal_ppf(p: float) -> float:
    """
    Inverse of the standard normal CDF — given a probability, return the z-score.

    Implements the AS241 algorithm (Wichura 1988) — a rational polynomial
    approximation accurate to ~10^-9 over the full range. Pure Python, no scipy.

    Args:
        p: Probability in (0, 1).

    Returns:
        The z such that Φ(z) = p.

    Raises:
        ValueError: If p is outside (0, 1).
    """
```

Don't add docstrings to trivial helper functions (1-3 line setters/getters). Focus on the substantive ones.

### Step 6 — TypeScript JSDoc

For each TypeScript file listed in the "TypeScript files to docstring" section, add JSDoc comments above the most important exported functions.

**Template**:

```typescript
/**
 * <one-line summary>
 *
 * <2-4 sentence detailed explanation if non-trivial>
 *
 * @param param1 - <description>
 * @param param2 - <description>
 * @returns <description>
 * @throws {ErrorType} <when this is thrown>
 *
 * @example
 * const result = functionName(arg1, arg2);
 */
export function functionName(param1: Type, param2: Type): ReturnType {
  // ...
}
```

For `dashboard/lib/bedrock.ts` specifically, the `generateReadout()` function deserves a careful JSDoc that mentions:
- The prompt is structured to produce JSON output
- Fallback model handling
- The verdict types it can return (treatment_wins, control_wins, no_significant_difference, srm_invalidated, insufficient_data)

For `dashboard/lib/experiment-results.ts`, document `computeExperimentResults()` thoroughly — it's the central function used across multiple endpoints.

For `dashboard/lib/timeseries.ts`, document `getExperimentDailyLift()` and `getExperimentFunnel()` — both have non-trivial SQL.

### Step 7 — Dead code removal

Search for and remove:

```bash
# Debug console.log (preserve console.warn and console.error)
grep -rn "console\.log" web/ dashboard/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v ".next"

# Commented-out code blocks larger than 3 lines
# (do this manually — automated detection is unreliable)

# TODO/FIXME comments
grep -rn "TODO\|FIXME\|XXX" web/ dashboard/ --include="*.ts" --include="*.tsx" --include="*.py" 2>/dev/null | grep -v "node_modules"
```

For each result:
- `console.log` lines that are clearly debug remnants → remove
- `console.log` lines that are intentional logging → convert to `console.warn` or `console.info`
- `console.log` in development-only paths or in test scripts → leave alone
- TODO/FIXME comments → leave alone (they document known limitations honestly)

Also look for:
- Files named `*.bak`, `*.old`, `*.tmp` → delete
- Files clearly named as scratch (`test.py`, `temp.ts`, `scratch.tsx`) → review with user before deleting
- Empty `.tsx` or `.ts` files → delete

### Step 8 — File structure tidying

Look for misplaced files:

- `CLAUDE_CODE_PHASE_*_PROMPT.md` files → these should live in `dashboard/docs/` if they exist anywhere else, move them
- Any `.md` files at the root of `web/` or `dashboard/` that aren't README.md → consider moving to a `docs/` subfolder
- Scattered `.sql` or test files → consolidate into proper subfolders

Don't aggressively reorganize. Just make sure obviously misplaced files are in coherent locations.

## 3. Definition of done

Before declaring complete:

1. ✅ Secret audit complete — NO secrets committed in the repo (or user has confirmed all matches are intentional)
2. ✅ `.gitignore` exists at root, in `web/`, and in `dashboard/` with comprehensive patterns
3. ✅ All `requirements.txt` files accurately reflect actual dependencies
4. ✅ Python files in the focus list have module + function docstrings
5. ✅ TypeScript files in the focus list have JSDoc on exported functions
6. ✅ Obvious dead code removed (debug console.logs, empty files, *.bak files)
7. ✅ `npm run build` in both `web/` and `dashboard/` still succeeds with zero TypeScript errors
8. ✅ `python -m pytest dashboard/lambdas/aggregator/tests/ -v` still shows all 33 tests passing
9. ✅ No public API signatures changed (verify by checking that the SDK on the headphones site still works)

## 4. What to send back when done

1. Output of `npm run build` for both `web/` and `dashboard/`
2. Output of `python -m pytest dashboard/lambdas/aggregator/tests/ -v`
3. A summary of:
   - Files modified
   - Lines of docstrings/JSDoc added
   - Secret audit findings (if any)
   - Dead code removed
4. Confirmation that the live demo (caliper-xi.vercel.app, headphones site) still works after deploying

If anything fails or the secret audit finds something concerning, stop and tell the user immediately.

---

## 5. Critical notes for the implementer

**On adding docstrings**: This is the longest task in the phase. Don't sprawl — keep docstrings focused. A docstring that says "computes the lift" is useless. A docstring that says "Computes the relative lift (treatment - control) / control, with NaN protection when control rate is zero. Used by the experiment results endpoint and the comparison API." is useful. Length 2-4 sentences max.

**On code style consistency**: If existing docstrings in the codebase use Google style, Sphinx style, or another format, MATCH THE EXISTING STYLE. Don't introduce a new convention. Check 2-3 existing docstrings before adding new ones.

**On preserving functionality**: This is a cleanup pass, NOT a refactor. The same code should produce the same results before and after. If you're tempted to "improve" a function while adding docstrings, RESIST. Add the docstring, move on.

**On the secret audit**: This is the most important step. False positives are OK (you may flag patterns that aren't actually secrets). False negatives are NOT OK. If a real secret is committed and we miss it, that's a credential leak. Err on the side of flagging more for the user to review.

**On not touching Lambdas**: Lambda code changes require redeployment. Adding docstrings to `handler.py` is fine because docstrings don't change function behavior, but verify after deployment that the Lambda still works.

---

Begin. Execute steps 1 → 8 in order. Verify the build and tests still pass at the end. Do NOT make any changes that would require re-deploying the live production infrastructure unless explicitly tested.
