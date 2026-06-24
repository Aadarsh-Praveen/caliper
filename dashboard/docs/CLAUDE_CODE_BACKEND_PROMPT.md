## Pre-build clarifications — read first

Before reading the rest of this document, internalize these four corrections to assumptions:

### 1. Aurora schema is already provisioned (don't try to create it)

The `experiments` table and 5 others (customers, users, experiment_results, segment_results, readouts) already exist in Aurora with the schema bootstrapped. Use `\d experiments` in pgcli if you need to inspect.

The `experiments` table has these columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `customer_id UUID NOT NULL REFERENCES customers(id)`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL` (uniqueness is enforced via UNIQUE constraint on (customer_id, slug))
- `hypothesis TEXT`
- `primary_metric TEXT NOT NULL`
- `metric_type TEXT NOT NULL CHECK IN ('binary', 'continuous')`
- `secondary_metrics JSONB DEFAULT '[]'`
- `guardrail_metrics JSONB DEFAULT '[]'`
- `variants JSONB NOT NULL` (e.g., `[{"name": "control", "allocation": 0.5}, ...]`)
- `status TEXT NOT NULL DEFAULT 'draft' CHECK IN ('draft', 'running', 'stopped', 'completed')`
- `cuped_enabled BOOLEAN NOT NULL DEFAULT false`
- `cuped_covariate TEXT`
- `sequential_enabled BOOLEAN NOT NULL DEFAULT false`
- `minimum_detectable_effect FLOAT`
- `baseline_conversion_rate FLOAT`
- `target_power FLOAT DEFAULT 0.80`
- `significance_level FLOAT DEFAULT 0.05`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `started_at TIMESTAMPTZ`
- `stopped_at TIMESTAMPTZ`

When INSERTing, you can omit any column with a default. Variants and metric arrays are JSONB — pass them as objects to `pg`, it handles JSON serialization. Use parameterized queries throughout. Never run DDL — don't try to alter the schema.

### 2. Port is 3001, not 3000

The dashboard dev server runs on port 3001 because port 3000 is occupied by the sibling `web/` project's dev server. All curl tests and local URLs should use `localhost:3001`. Don't try to change the port — it's correct as-is.

### 3. `.env.local` exists as a symlink — don't touch it

The credentials file is `dashboard/.env.local`, which is a symlink pointing to `../.env` (a file at the monorepo root). The file is already populated with all needed values:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DYNAMODB_TABLE_NAME`
- `DATABASE_URL`
- `BEDROCK_MODEL_ID`
- `BEDROCK_FALLBACK_MODEL_ID`
- `PUBLIC_DEMO_API_KEY`
- `PUBLIC_DEMO_CUSTOMER_SLUG`

**Do not create or modify the env file.** Just read `process.env` in your code via the Zod-validated `lib/env.ts`. The Next.js dev server already loads this file — you'll see `- Environments: .env.local` in the startup output.

If for any reason your code can't read env vars, the issue is in `lib/env.ts` (Zod validation throwing) — investigate and fix the code, never the env file.

### 4. `BEDROCK_FALLBACK_MODEL_ID` value

It's set to `amazon.nova-lite-v1:0` in `.env.local`. Validate it in the Zod schema (just `z.string().min(1)`) so missing-var checks pass, but don't actually use it in any code this phase. Bedrock readout generation is a separate later phase.

### 5. Public demo customer already seeded

A customer record already exists in Aurora:
- `id = '00000000-0000-0000-0000-000000000001'`
- `slug = 'demo'`
- `api_key_hash = 'ea75a5a2dec18f0a3ebab19cf6e7e80df8e29f4e8b5c1c3c3a9e9c1b7c5e8a8f'`

That hash is the SHA-256 of the literal string `caliper_demo_key_public`. So when validating an incoming `X-API-Key: caliper_demo_key_public` header, SHA-256 it and match against `customers.api_key_hash`.

In `lib/auth.ts`:
```ts
import { createHash } from "crypto";
const hash = createHash("sha256").update(apiKey).digest("hex");
```

Don't re-seed the customer. Don't re-hash the key in a different way. If your hash doesn't match what's already in the database, you've hashed differently — adjust your code, not the database.

### 6. Hash function parity is non-negotiable

Before writing `dashboard/lib/hash.ts`, read `web/lib/caliper/sdk.ts` (sibling folder, one level up then into `web/`) and find the `cyrb53` function. Copy it verbatim — same constants, same bit-shift operations, same return type. After implementing, run a parity test:

```ts
// Test in dashboard/lib/__tests__/hash.test.ts
import { cyrb53 } from "../hash";

test("cyrb53 matches SDK output", () => {
  // These values were computed by the SDK
  expect(cyrb53("hello", 0)).toBe(/* SDK output */);
  expect(cyrb53("test_user:hero_cta_test", 0)).toBe(/* SDK output */);
});
```

To get the SDK's actual values, run a one-off Node script from `web/`:
```bash
cd ../web
node -e "const sdk = require('./lib/caliper/sdk.ts'); console.log(sdk.cyrb53('hello', 0)); console.log(sdk.cyrb53('test_user:hero_cta_test', 0));"
```
(or use ts-node if needed)

Capture those numbers and hardcode them as expected values. If they don't match, your dashboard's variant assignments will differ from the SDK's client-side fallback, breaking the platform.

### 7. Aurora SSL — required

The DATABASE_URL includes `?sslmode=require`. The `pg` library needs additional SSL config because AWS Aurora's certificate isn't in Node's default trust store:

```ts
new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

Without `rejectUnauthorized: false`, you'll hit "self-signed certificate in certificate chain" errors. This is fine for the hackathon — production would use AWS's CA bundle, but we're scoped to hackathon-grade.

### 8. CORS — necessary for SDK calls

The SDK in `web/` runs on a different Vercel domain. Every API route must respond to CORS preflight (OPTIONS) and include CORS headers in JSON responses. Use the `lib/cors.ts` helper described in section 7 of the main prompt.

---

End of clarifications. Now read the main build instructions below and execute.

# Caliper Backend — Claude Code Build Prompt

**Paste this entire document into Claude Code running inside the `dashboard/` folder of the caliper monorepo. Read it end-to-end before starting, then execute section by section.**

---

## 0. Context

You are building the backend of Caliper — a B2B A/B testing platform. The repo is a monorepo with two Next.js apps:

- **`web/`** — A premium headphones e-commerce site that's the *target* of A/B experiments. Has the Caliper JS SDK already integrated. You do NOT modify this folder.
- **`dashboard/`** — This folder, where you work. The Caliper SaaS product itself: backend APIs + admin dashboard UI.

The AWS infrastructure is already provisioned. Credentials are in `.env.local`:
- DynamoDB table `caliper-main` with PK/SK + GSI1, Streams enabled
- Aurora PostgreSQL cluster with schema bootstrapped (6 tables: customers, users, experiments, experiment_results, segment_results, readouts)
- Bedrock Claude Haiku 4.5 access verified
- IAM user with DynamoDB + Bedrock + CloudWatch permissions

A public demo customer already exists in Aurora:
- `id = 00000000-0000-0000-0000-000000000001`
- `slug = 'demo'`
- `api_key_hash = 'ea75a5a2dec18f0a3ebab19cf6e7e80df8e29f4e8b5c1c3c3a9e9c1b7c5e8a8f'` (sha256 of `caliper_demo_key_public`)

## 1. What to build

In this order:

1. Foundation libraries (`lib/`)
2. API routes (`app/api/`)
3. Dashboard UI pages (`app/`)
4. Verify end-to-end

Do NOT build the aggregator Lambda, the synthetic data generator, dbt models, Bedrock readouts, or MLflow integration. Those are separate phases.

## 2. File structure to create

```
dashboard/
├── lib/
│   ├── hash.ts                        # cyrb53 — MUST match web/lib/caliper/sdk.ts exactly
│   ├── env.ts                         # Zod-validated env vars
│   ├── dynamodb.ts                    # DDB client + helpers
│   ├── postgres.ts                    # Aurora connection pool
│   ├── auth.ts                        # API key validation
│   └── types.ts                       # Shared TypeScript types
├── app/
│   ├── page.tsx                       # Landing page (replace default)
│   ├── api/
│   │   ├── ingest/route.ts            # POST events
│   │   ├── assign/route.ts            # GET variant assignment
│   │   └── experiments/
│   │       ├── route.ts               # GET (list), POST (create)
│   │       └── [id]/
│   │           ├── route.ts           # GET (detail), PATCH (status)
│   │           └── results/route.ts   # GET (live stats)
│   └── (dashboard)/
│       └── experiments/
│           ├── page.tsx               # List view
│           ├── new/page.tsx           # Create form
│           └── [id]/page.tsx          # Detail view
└── components/
    ├── ui/                            # shadcn/ui primitives (install fresh)
    └── experiments/
        ├── ExperimentList.tsx
        ├── ExperimentForm.tsx
        ├── StatsCard.tsx
        ├── ConfidenceBandChart.tsx
        ├── SegmentTable.tsx
        ├── SRMWarningBanner.tsx
        └── PowerCalculator.tsx
```

## 3. Library code

### 3.1 `lib/hash.ts` — CRITICAL: identical to the SDK

The SDK in the sibling `web/` folder uses cyrb53. Copy the exact implementation. Read `web/lib/caliper/sdk.ts` (sibling folder, one level up then into web/) and copy the `cyrb53` function verbatim. Do not modify it.

Export this:

```ts
export function cyrb53(str: string, seed: number = 0): number {
  // Exact same implementation as web/lib/caliper/sdk.ts
}

export function assignVariant(
  userId: string,
  experimentId: string,
  variants: Array<{ name: string; allocation: number }>
): string {
  const hashInput = `${userId}:${experimentId}`;
  const hash = cyrb53(hashInput);
  const bucket = hash % 100;
  
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.allocation * 100;
    if (bucket < cumulative) return variant.name;
  }
  return variants[variants.length - 1].name; // fallback
}
```

Write a test file `lib/__tests__/hash.test.ts` that verifies cyrb53 produces specific known outputs for specific inputs. Test inputs:
- `cyrb53("hello", 0)` → record output
- `cyrb53("test_user:hero_cta_test", 0)` → record output

Run this test once, capture the actual outputs, hardcode them as expected values. These exact values must match what the SDK produces. After capturing, also test the SDK side: in `web/`, run a tiny script that calls `cyrb53("hello", 0)` and verifies it produces the same number. If they don't match, fail loudly.

### 3.2 `lib/env.ts` — Zod-validated env vars

```ts
import { z } from "zod";

const EnvSchema = z.object({
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  DYNAMODB_TABLE_NAME: z.string().default("caliper-main"),
  DATABASE_URL: z.string().url(),
  BEDROCK_MODEL_ID: z.string().min(1),
  BEDROCK_FALLBACK_MODEL_ID: z.string().min(1),
  PUBLIC_DEMO_API_KEY: z.string().min(1),
  PUBLIC_DEMO_CUSTOMER_SLUG: z.string().default("demo"),
});

export const env = EnvSchema.parse(process.env);
```

This throws clearly at startup if anything is missing.

### 3.3 `lib/dynamodb.ts` — DDB client + helpers

Use `@aws-sdk/lib-dynamodb` (the Document Client wrapper). Connect using the env vars. Export:

- `ddb` — the document client instance
- `tableName` — the table name from env
- Helpers:
  - `putEvent(experimentId, userId, eventName, properties, context, ts)` → writes Event item
  - `getAssignment(experimentId, userId)` → reads Assignment item, returns null if not found
  - `putAssignment(experimentId, userId, variant, source)` → writes Assignment item with conditional put (don't overwrite)
  - `getSummary(experimentId, variant)` → reads Summary item
  - `incrementSummary(experimentId, variant, eventName, value)` → atomic UpdateExpression with ADD for n/sum/sum_sq/conversions
  - `queryEvents(experimentId, fromTs?, limit?)` → query by PK with EVT# sort key prefix
  - `getSRMFlags(experimentId)` → query for SRM# items

Each helper has proper TypeScript types. The key construction follows section 3.1 of `CALIPER_BACKEND_SPEC.md` (in /mnt/user-data/uploads or similar; if unavailable, infer from the schema below):

- Event item: `PK = "EXP#" + experimentId`, `SK = "EVT#" + ts + "#" + userId`
- Assignment: `PK = "EXP#" + experimentId`, `SK = "ASSIGN#" + userId`
- Summary: `PK = "EXP#" + experimentId`, `SK = "SUMMARY#" + variant`

Include GSI1 fields where defined:
- Event: `GSI1PK = "USER#" + userId`, `GSI1SK = "EVT#" + ts`
- Assignment: `GSI1PK = "USER#" + userId`, `GSI1SK = "ASSIGN#" + experimentId`

Set `expires_at` on Event items to `(now + 30 days) / 1000` (Unix seconds for TTL).

### 3.4 `lib/postgres.ts` — Aurora connection pool

Use `pg`. Aurora requires SSL — the DATABASE_URL should include `?sslmode=require`. If it doesn't, append it programmatically.

```ts
import { Pool } from "pg";
import { env } from "./env";

const connectionString = env.DATABASE_URL.includes("sslmode=")
  ? env.DATABASE_URL
  : `${env.DATABASE_URL}${env.DATABASE_URL.includes("?") ? "&" : "?"}sslmode=require`;

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // AWS Aurora cert isn't in Node's default CA bundle
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
```

Use parameterized queries everywhere — never string-concatenate user input into SQL.

### 3.5 `lib/auth.ts` — API key validation

```ts
import { createHash } from "crypto";
import { queryOne } from "./postgres";

export async function getCustomerByApiKey(apiKey: string) {
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return queryOne<{ id: string; slug: string; plan: string }>(
    `SELECT id, slug, plan FROM customers WHERE api_key_hash = $1`,
    [hash]
  );
}

export function getApiKeyFromRequest(req: Request): string | null {
  return req.headers.get("X-API-Key");
}
```

### 3.6 `lib/types.ts` — Shared types

Define interfaces for: `Experiment`, `Variant`, `EventPayload`, `IngestRequest`, `AssignResponse`, `ExperimentResults`, `Summary`, `Customer`.

## 4. API routes

All routes return JSON. Use Zod to validate request bodies. Return 400 for validation errors, 401 for missing/invalid API key, 404 for missing resources, 500 for unexpected errors.

### 4.1 `POST /api/ingest`

Request body:
```json
{
  "user_id": "uuid",
  "events": [
    {
      "event_name": "experiment_exposed",
      "experiment_id": "hero_cta_test",
      "variant": "treatment",
      "properties": { ... },
      "ts": "2026-06-17T12:00:00Z",
      "context": { "device": "mobile", "country": "US" }
    }
  ]
}
```

Behavior:
1. Validate API key from `X-API-Key` header → 401 if missing/invalid
2. Validate body with Zod → 400 on failure
3. For each event, call `putEvent(...)` — batch writes via BatchWriteItem (max 25 per batch)
4. Return `{ ingested: <count> }` with status 202

CORS: Allow POST from any origin (`Access-Control-Allow-Origin: *`) and the headers `Content-Type, X-API-Key`. Also handle OPTIONS preflight requests. This is necessary because the SDK from `web/` will call this from a different Vercel domain.

### 4.2 `GET /api/assign?user_id=...&experiment_id=...`

Behavior:
1. Validate API key → 401 if missing
2. Validate query params → 400 if missing
3. Try `getAssignment(experiment_id, user_id)` from DynamoDB. If found, return that variant.
4. If not found:
   - Look up the experiment in Aurora by slug + customer_id (the customer is determined by the API key)
   - If not found → 404
   - If status is not `running` and not `draft` → return error (don't assign to stopped experiments). Actually for the hackathon, ALLOW assignment to draft AND running (so judges can demo before launching anything formally).
   - Compute variant via `assignVariant(user_id, experiment_id, experiment.variants)`
   - Call `putAssignment(...)` with a ConditionExpression to avoid race conditions (only put if `SK` doesn't exist yet — if it already does, re-read and return that)
5. Return `{ variant: "...", experiment_id: "...", assigned_at: "..." }`

CORS same as ingest.

### 4.3 `POST /api/experiments` — create experiment

Request body:
```json
{
  "name": "Hero CTA Test",
  "slug": "hero_cta_test",
  "hypothesis": "...",
  "primary_metric": "buy_section_view",
  "metric_type": "binary",
  "variants": [
    { "name": "control", "allocation": 0.5 },
    { "name": "treatment", "allocation": 0.5 }
  ],
  "baseline_conversion_rate": 0.04,
  "minimum_detectable_effect": 0.08
}
```

Behavior:
1. Validate API key
2. Validate body — variants' allocations must sum to 1.0
3. Insert into `experiments` table with status='draft', customer_id from API key
4. Return the created experiment

### 4.4 `GET /api/experiments`

Lists experiments for the authenticated customer. Optional query params `?status=running&limit=20`. Returns array of experiments with current summary stats merged in (read summary items from DynamoDB per experiment).

### 4.5 `GET /api/experiments/[id]`

Returns one experiment by ID (UUID). 404 if not found or doesn't belong to authenticated customer.

### 4.6 `PATCH /api/experiments/[id]`

Body: `{ "status": "running" | "stopped" | "completed" }`. Sets `started_at` on transition to running, `stopped_at` on transition to stopped. Reject invalid transitions (e.g., draft → completed without going through running).

### 4.7 `GET /api/experiments/[id]/results`

Returns the consolidated live-stats payload:

```json
{
  "experiment": { ... },
  "variants": [
    {
      "name": "control",
      "n": 4823,
      "conversions": 192,
      "conversion_rate": 0.0398,
      "mean": 0.0398,
      "variance": 0.0383
    }
  ],
  "lift": 0.236,
  "lift_ci": [0.054, 0.418],
  "p_value": 0.011,
  "is_significant": true,
  "srm_flag": null,
  "segments": [],
  "readout": null
}
```

For now (before the aggregator Lambda is built), compute basic stats on the fly:
- Read summary items from DynamoDB
- Compute two-proportion z-test in TypeScript right here using a simple inline function (don't pull in a library)
- Compute Wald CI
- Return null for `segments` and `readout` — those come from the aggregator + Bedrock layers we'll build later

Add a small `lib/stats.ts` with the inline z-test math. Implementation:
- Pooled proportion: `p = (x1 + x2) / (n1 + n2)`
- SE: `sqrt(p * (1-p) * (1/n1 + 1/n2))`
- z = `(p2 - p1) / SE`
- p-value from normal CDF (write a simple approximation — Abramowitz & Stegun 26.2.17)
- 95% Wald CI on the difference: `(p2 - p1) ± 1.96 * sqrt(p1*(1-p1)/n1 + p2*(1-p2)/n2)`

## 5. Dashboard UI

Install shadcn/ui fresh in this project:

```bash
npx shadcn@latest init
```

Pick:
- Style: Default
- Base color: Zinc
- CSS variables: yes

Then install components as needed:

```bash
npx shadcn@latest add button card badge table input label select form
```

### 5.1 Visual design

Match these design tokens for consistency with the `web/` headphones site (which uses warm dark-mode):

- Background: `bg-[#0E0E0E]`
- Text: `text-[#F5F3EE]`
- Muted text: `text-[#888888]`
- Accent (gold): `#B8923A`
- Card backgrounds: `bg-[#1A1A1A]` with `border-[#2A2A2A]`
- Use `font-serif` (Inter or default) for body, optionally a display serif for big numbers

Take inspiration from Linear, Eppo, and Statsig dashboards. Dense, data-first, no emojis except status indicators (✓ ⚠).

### 5.2 Landing page `/`

Replace the default Next.js page. Show:
- Caliper logo / wordmark at top-left
- Centered hero: "B2B Experimentation. Statistical rigor without the price tag."
- Two CTA buttons: "Try the demo" → `/experiments` and "Sign up" (stub, just links to `#`)
- Footer with link to GitHub and "Built for AWS H0 Hackathon"

### 5.3 Experiments list `/experiments`

Top bar with "Create experiment" button (→ `/experiments/new`).

Table of experiments. Columns:
- Name (clickable → detail)
- Status badge (draft/running/stopped/completed)
- Primary metric
- Sample size (sum across variants)
- p-value (or "—" if not enough data)
- Last activity (relative time)

Fetch from `/api/experiments` with API key in header.

### 5.4 Create experiment `/experiments/new`

Form with these fields:
- Name (text)
- Slug (text, lowercase+underscore validation)
- Hypothesis (textarea)
- Primary metric (text — the event name to count)
- Metric type (select: binary / continuous)
- Variants (default to control 50% / treatment 50%; allow editing)
- Baseline conversion rate (percentage input)
- Minimum detectable effect (percentage input)

**Power calculator panel** — to the right of the form, updates live:
- Computes: required N per variant = ceil(16 * p * (1-p) / mde²) where p is baseline conversion rate and mde is minimum detectable effect (both as decimals)
- Displays: "With your current baseline rate and MDE, you need ~X users per variant. At 2,000 daily visitors per variant, that's ~Y days."
- Use 2,000 as the assumed traffic for now — we can make it configurable later

POST to `/api/experiments`, redirect to `/experiments/[id]` on success.

### 5.5 Experiment detail `/experiments/[id]`

Sections, top to bottom:

**Header**: Experiment name, status badge, hypothesis, "Start" / "Stop" button (calls PATCH).

**SRM warning banner** (red, prominent): Only rendered when `srm_flag !== null`. Text: "⚠ Sample Ratio Mismatch detected. Observed split [observed] vs expected [expected]. Do not trust these results until the underlying issue is resolved."

**Stats cards** — one card per variant, in a row:
- Variant name
- Sample size (n)
- Conversion rate (with confidence interval)
- Mean ± SD if continuous

**Lift summary** — below the stats cards, prominent:
- "Treatment lifted [primary metric] by **+23.6%**"
- "p-value: 0.011 — Statistically significant"
- "95% CI: [+5.4%, +41.8%]"
- Color the lift number green if significant + positive, red if significant + negative, gray if not significant.

**Confidence-band chart** — Recharts (install it: `npm install recharts`). Show a placeholder for now if no time-series data exists yet. Just a small "Confidence band visualization will appear here once data has accumulated." If results come back with data, render an area chart.

**Segment table** — shadcn table. Shows segments returned from API (null for now — display "Segment analysis available once the analytics pipeline runs.")

**Bedrock readout card** — at the top of the page when present, otherwise hidden. Just a placeholder "Plain-English readout from Bedrock will appear once the experiment is complete."

Poll `/api/experiments/[id]/results` every 5 seconds while the experiment is running. Use SWR or just `setInterval` + `fetch`.

## 6. Definition of done

Before declaring done, verify each of these by hand:

1. ✅ `npm run build` succeeds with zero TypeScript errors and zero ESLint errors
2. ✅ `npm run dev` starts cleanly
3. ✅ Visiting `http://localhost:3001` shows the Caliper landing page (not the default Next.js scaffold)
4. ✅ Visiting `http://localhost:3001/experiments` shows an empty experiments list
5. ✅ Filling out `/experiments/new` and submitting creates a row in the Aurora `experiments` table — verify with a `SELECT * FROM experiments` query in pgcli
6. ✅ The detail page for that experiment loads at `/experiments/[id]`
7. ✅ `curl` test:
   ```bash
   curl -X POST http://localhost:3001/api/ingest \
     -H "X-API-Key: caliper_demo_key_public" \
     -H "Content-Type: application/json" \
     -d '{
       "user_id": "test-user-123",
       "events": [{
         "event_name": "page_view",
         "experiment_id": "hero_cta_test",
         "variant": "treatment",
         "properties": {},
         "ts": "2026-06-17T12:00:00Z",
         "context": { "device": "desktop", "country": "US" }
       }]
     }'
   ```
   Returns `{"ingested": 1}` with status 202. Verify the event appears in DynamoDB.
8. ✅ `curl` test of `/api/assign`:
   ```bash
   curl "http://localhost:3001/api/assign?user_id=test-user-456&experiment_id=hero_cta_test" \
     -H "X-API-Key: caliper_demo_key_public"
   ```
   Returns a variant. Calling it again with the same user_id returns the same variant (sticky bucketing works).
9. ✅ Variant assignment from the API matches what the SDK produces for the same user_id. Test by reading the SDK output for a known user_id and confirming the API returns the same.

## 7. CORS — important

The SDK in `web/` runs on a different Vercel domain. The API in `dashboard/` must respond to CORS preflight requests. Add a CORS helper:

```ts
// lib/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

export function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function corsOptionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
```

Every API route exports a `OPTIONS` handler that returns `corsOptionsResponse()`. Every JSON response uses `corsResponse()`.

## 8. What NOT to do

To stay scoped:

- ❌ Don't build the aggregator Lambda (separate phase)
- ❌ Don't build the synthetic data generator (separate phase)
- ❌ Don't build dbt models (separate phase)
- ❌ Don't build Bedrock readout generation (separate phase)
- ❌ Don't build MLflow integration (separate phase)
- ❌ Don't build login, signup, OAuth, password reset
- ❌ Don't build billing, Stripe, plan tiers
- ❌ Don't build feature flags as a separate concept
- ❌ Don't build infrastructure-as-code (Terraform / CDK) — AWS is already provisioned
- ❌ Don't build CUPED, mSPRT, SRM detection — those go in the aggregator Lambda later. Just basic z-test inline.
- ❌ Don't write production-quality code for everything — clean, working, hackathon-grade. Comments where non-obvious. Skip unit tests except for `hash.ts`.
- ❌ Don't add unnecessary dependencies. The libraries already in package.json should suffice.

## 9. When done

Show me:

1. Output of `npm run build` (must be clean)
2. Output of the three curl tests in section 6
3. Screenshot of `/experiments` page in the browser
4. Screenshot of `/experiments/[id]` page with a real experiment
5. A `SELECT * FROM experiments` query result from pgcli proving the data persists
6. The list of all files you created (or significantly modified)

If anything failed, tell me what and stop — don't paper over errors.

---

Begin. Read this whole document first, ask for clarification only if something is genuinely ambiguous (otherwise infer the obvious answer), then execute.
