# Caliper Phase 4 — Bedrock-Generated Experiment Readouts

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root. Read it end-to-end before starting.**

---

## 0. Context — where we are

**Done in previous phases:**
- Full backend + dashboard live in production at `caliper-xi.vercel.app`
- Three experiments populated with ~30K events each
- Aggregator Lambda processes DynamoDB Streams in real time
- 5 statistical methods working: z-test, Welch's t, SRM, CUPED, mSPRT (33/33 unit tests passing)
- Pure Python implementations of normal CDF, chi-squared, and t-distribution (no scipy dependency)
- Dashboard already shows: stats cards, lift summary, confidence band chart, CUPED card, mSPRT card, SRM warning banner

**Empty `readouts` table in Aurora** is waiting to be filled with LLM-generated narrative summaries. That's what this phase does.

## 1. What you're building

Three deliverables, in order:

### Deliverable 1 — A readout-generation API route

A new Next.js API route at `POST /api/experiments/[id]/readout` that:
1. Reads the full experiment state (config + stats + segments + SRM status)
2. Sends a structured prompt to Bedrock (Claude Haiku 4.5)
3. Parses the model's response into a structured readout
4. Stores it in the Aurora `readouts` table
5. Returns the readout as JSON

### Deliverable 2 — A readout card on the experiment detail page

Visual component at the top of `/experiments/[id]` showing:
- The narrative summary (2-5 sentences)
- The verdict label (e.g., "Treatment Wins", "No Significant Effect", "SRM — Results Invalid")
- A confidence indicator
- The biggest-segment effect (if available; null is fine for now)
- A "Regenerate" button to re-call the API

### Deliverable 3 — Auto-generation on experiment stop

When an experiment status transitions to `stopped` or `completed` via PATCH `/api/experiments/[id]`, automatically trigger readout generation. The PATCH endpoint awaits the readout completion before returning.

## 2. What NOT to build this phase

To stay scoped:

- ❌ Streaming responses (just return the full readout when done)
- ❌ Embeddings, RAG, vector search
- ❌ Auto-regeneration on every data change (only on stop or manual button)
- ❌ Multi-language support
- ❌ Conversation/chat with the readout
- ❌ Confidence calibration beyond what the model produces
- ❌ Cost tracking / token accounting UI

Two-API-calls-per-experiment limit is fine for hackathon scope. Production would batch and cache more aggressively.

## 3. Bedrock client setup

### 3.1 New file — `dashboard/lib/bedrock.ts`

```ts
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { env } from "./env";

const bedrock = new BedrockRuntimeClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface BedrockReadoutInput {
  experimentName: string;
  hypothesis: string;
  primaryMetric: string;
  metricType: "binary" | "continuous";
  status: string;
  variants: Array<{
    name: string;
    n: number;
    conversions: number;
    conversion_rate: number;
  }>;
  lift: number | null;
  liftCi: [number, number] | null;
  pValue: number | null;
  msprtPValue: number | null;
  msprtShouldStop: boolean | null;
  cupedVarianceReduction: number | null;
  srmDetected: boolean;
  srmObserved?: Record<string, number>;
  srmExpected?: Record<string, number>;
  daysRunning: number;
}

export interface BedrockReadout {
  verdict: "treatment_wins" | "control_wins" | "no_significant_difference" | "srm_invalidated" | "insufficient_data";
  summary: string;          // 2-5 sentences
  recommendation: string;   // 1 sentence
  confidence: "high" | "medium" | "low";
  raw_response: string;     // for debugging
}

const SYSTEM_PROMPT = `You are a senior product analyst at Caliper, a B2B A/B testing platform. 
You generate plain-English readouts of A/B test results for product managers who are not statisticians.

Your tone: confident, calibrated, no jargon. Lead with the verdict. Acknowledge uncertainty when present.
Length: exactly 2-5 sentences for the summary, 1 sentence for the recommendation.

Critical rules:
- If SRM is detected, the verdict is "srm_invalidated" — do not report a lift number, do not say which variant won. The summary must say the underlying randomization is broken.
- If always-valid p-value (mSPRT) is high (>0.05) but classical p-value is low (<0.05), say so explicitly — this is the classic "peeking" trap. Recommend continuing to collect data.
- If both p-values agree on significance with a clear lift, declare the winner.
- If both p-values are >0.05, declare no significant effect.

Output exactly this JSON shape, no other text:
{
  "verdict": "treatment_wins" | "control_wins" | "no_significant_difference" | "srm_invalidated" | "insufficient_data",
  "summary": "2-5 sentences",
  "recommendation": "1 sentence",
  "confidence": "high" | "medium" | "low"
}`;

export async function generateReadout(input: BedrockReadoutInput): Promise<BedrockReadout> {
  const userPrompt = buildUserPrompt(input);
  
  const command = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 600,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
      ],
    }),
  });
  
  let response;
  try {
    response = await bedrock.send(command);
  } catch (primaryError) {
    console.warn("[Bedrock] Primary model failed, trying fallback:", primaryError);
    response = await invokeWithFallback(command, env.BEDROCK_FALLBACK_MODEL_ID, userPrompt);
  }
  
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const rawText = responseBody.content[0].text;
  
  return parseReadoutResponse(rawText);
}

function buildUserPrompt(input: BedrockReadoutInput): string {
  const lines = [
    `Generate a readout for this experiment:`,
    ``,
    `Experiment: ${input.experimentName}`,
    `Hypothesis: ${input.hypothesis || "(none provided)"}`,
    `Primary metric: ${input.primaryMetric} (${input.metricType})`,
    `Days running: ${input.daysRunning}`,
    ``,
    `Variants:`,
  ];
  
  for (const v of input.variants) {
    lines.push(`  ${v.name}: n=${v.n.toLocaleString()}, ${v.conversions} conversions, ${(v.conversion_rate * 100).toFixed(2)}% rate`);
  }
  
  lines.push(``);
  lines.push(`Statistical results:`);
  if (input.lift !== null) {
    lines.push(`  Lift: ${(input.lift * 100).toFixed(2)}% (treatment vs control)`);
  }
  if (input.liftCi) {
    lines.push(`  95% CI: [${(input.liftCi[0] * 100).toFixed(2)}%, ${(input.liftCi[1] * 100).toFixed(2)}%]`);
  }
  if (input.pValue !== null) {
    lines.push(`  Classical p-value: ${input.pValue.toFixed(4)}`);
  }
  if (input.msprtPValue !== null) {
    lines.push(`  Always-valid p-value (mSPRT): ${input.msprtPValue.toFixed(4)}`);
    lines.push(`  mSPRT recommendation: ${input.msprtShouldStop ? "safe to stop" : "continue collecting"}`);
  }
  if (input.cupedVarianceReduction !== null) {
    lines.push(`  CUPED variance reduction: ${(input.cupedVarianceReduction * 100).toFixed(1)}%`);
  }
  
  if (input.srmDetected) {
    lines.push(``);
    lines.push(`⚠ SAMPLE RATIO MISMATCH DETECTED.`);
    if (input.srmObserved && input.srmExpected) {
      lines.push(`Observed split: ${JSON.stringify(input.srmObserved)}`);
      lines.push(`Expected split: ${JSON.stringify(input.srmExpected)}`);
    }
    lines.push(`The underlying randomization is broken. Results cannot be trusted.`);
  }
  
  return lines.join("\n");
}

function parseReadoutResponse(rawText: string): BedrockReadout {
  // Try to extract JSON from the response. The model should output pure JSON
  // but we're defensive in case it wraps it in markdown or adds prose.
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in Bedrock response: ${rawText.slice(0, 200)}`);
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validate required fields
  if (!parsed.verdict || !parsed.summary || !parsed.recommendation || !parsed.confidence) {
    throw new Error(`Bedrock readout missing required fields: ${jsonMatch[0]}`);
  }
  
  return {
    verdict: parsed.verdict,
    summary: parsed.summary,
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    raw_response: rawText,
  };
}

async function invokeWithFallback(
  originalCommand: InvokeModelCommand,
  fallbackModelId: string,
  userPrompt: string
) {
  // Some models (like Nova Lite) use a different request format.
  // For Nova, use the Bedrock Converse API instead. But for hackathon,
  // simplest approach: just retry with the same body and let it fail
  // if the fallback isn't compatible. Caller will see the error.
  const command = new InvokeModelCommand({
    modelId: fallbackModelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 600,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  return await bedrock.send(command);
}
```

## 4. API route — `POST /api/experiments/[id]/readout`

Create `dashboard/app/api/experiments/[id]/readout/route.ts`:

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCustomerByApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { queryOne, query } from "@/lib/postgres";
import { getSummary, getSRMFlags } from "@/lib/dynamodb";
import { generateReadout, type BedrockReadoutInput } from "@/lib/bedrock";
import { corsResponse, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  // Auth
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    return corsResponse({ error: "Missing API key" }, 401);
  }
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) {
    return corsResponse({ error: "Invalid API key" }, 401);
  }
  
  // Load experiment
  const experiment = await queryOne<any>(
    `SELECT * FROM experiments WHERE id = $1 AND customer_id = $2`,
    [id, customer.id]
  );
  if (!experiment) {
    return corsResponse({ error: "Experiment not found" }, 404);
  }
  
  // Gather stats from DynamoDB
  const variants = experiment.variants as Array<{ name: string; allocation: number }>;
  const summaryItems = await Promise.all(
    variants.map((v) => getSummary(experiment.slug, v.name))
  );
  
  // Compute lift, p-values, etc. — reuse the same logic from /results route
  // (For simplicity, we'll call our own /results endpoint; or extract to a shared lib)
  const resultsResponse = await fetch(
    `${req.nextUrl.origin}/api/experiments/${id}/results`,
    {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    }
  );
  if (!resultsResponse.ok) {
    return corsResponse({ error: "Failed to load experiment results" }, 500);
  }
  const results = await resultsResponse.json();
  
  // Calculate days running
  const startedAt = experiment.started_at ? new Date(experiment.started_at) : new Date();
  const now = new Date();
  const daysRunning = Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Build Bedrock input
  const input: BedrockReadoutInput = {
    experimentName: experiment.name,
    hypothesis: experiment.hypothesis || "",
    primaryMetric: experiment.primary_metric,
    metricType: experiment.metric_type,
    status: experiment.status,
    variants: results.variants.map((v: any) => ({
      name: v.name,
      n: v.n,
      conversions: v.conversions,
      conversion_rate: v.conversion_rate,
    })),
    lift: results.lift ?? null,
    liftCi: results.lift_ci ?? null,
    pValue: results.p_value ?? null,
    msprtPValue: results.msprt_p_value ?? null,
    msprtShouldStop: results.msprt_should_stop ?? null,
    cupedVarianceReduction: results.cuped_variance_reduction ?? null,
    srmDetected: !!results.srm_flag,
    srmObserved: results.srm_flag?.observed_split,
    srmExpected: results.srm_flag?.expected_split,
    daysRunning,
  };
  
  // Generate readout via Bedrock
  let readout;
  try {
    readout = await generateReadout(input);
  } catch (error) {
    console.error("[Bedrock] Failed to generate readout:", error);
    return corsResponse(
      { error: "Failed to generate readout. Please try again." },
      500
    );
  }
  
  // Store in Aurora
  const inserted = await queryOne<any>(
    `INSERT INTO readouts (
      experiment_id, verdict, summary, recommendation, confidence, 
      generated_at, model_id
    ) VALUES ($1, $2, $3, $4, $5, now(), $6)
    RETURNING *`,
    [
      id,
      readout.verdict,
      readout.summary,
      readout.recommendation,
      readout.confidence,
      process.env.BEDROCK_MODEL_ID || "unknown",
    ]
  );
  
  return corsResponse({
    readout: inserted,
    raw_response: readout.raw_response,
  }, 200);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  // Auth (same as POST)
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) return corsResponse({ error: "Missing API key" }, 401);
  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) return corsResponse({ error: "Invalid API key" }, 401);
  
  // Return the LATEST readout for this experiment
  const readout = await queryOne<any>(
    `SELECT * FROM readouts 
     WHERE experiment_id = $1 
     ORDER BY generated_at DESC 
     LIMIT 1`,
    [id]
  );
  
  return corsResponse({ readout: readout || null }, 200);
}
```

## 5. Update `/api/experiments/[id]/results` to include the latest readout

Modify the results route to also fetch and include the most recent readout from the `readouts` table. Add this to the response payload:

```ts
const latestReadout = await queryOne<any>(
  `SELECT * FROM readouts WHERE experiment_id = $1 ORDER BY generated_at DESC LIMIT 1`,
  [experimentId]
);

return Response.json({
  ...existingFields,
  readout: latestReadout || null,
});
```

This way the experiment detail page can load the readout in the same fetch as everything else.

## 6. Update PATCH to auto-generate readout on stop

In `dashboard/app/api/experiments/[id]/route.ts`, the PATCH handler currently updates status. When the status transitions to `stopped` or `completed`, trigger readout generation:

```ts
// After updating the experiment status
if (newStatus === "stopped" || newStatus === "completed") {
  // Fire and forget — don't block the PATCH response on Bedrock
  fetch(`${req.nextUrl.origin}/api/experiments/${id}/readout`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
  }).catch((err) => {
    console.warn("[Bedrock] Auto-readout failed:", err);
  });
}
```

Make this fire-and-forget so the PATCH returns immediately. Bedrock takes 2-5 seconds; we don't want the UI to hang.

## 7. UI — Add the readout card

Create `dashboard/components/experiments/ReadoutCard.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Readout {
  verdict: string;
  summary: string;
  recommendation: string;
  confidence: string;
  generated_at: string;
}

interface Props {
  experimentId: string;
  initialReadout: Readout | null;
  apiKey: string;
}

const VERDICT_LABELS: Record<string, { text: string; color: string }> = {
  treatment_wins: { text: "Treatment Wins", color: "text-emerald-400" },
  control_wins: { text: "Control Wins", color: "text-emerald-400" },
  no_significant_difference: { text: "No Significant Difference", color: "text-zinc-400" },
  srm_invalidated: { text: "Results Invalid (SRM)", color: "text-red-400" },
  insufficient_data: { text: "Insufficient Data", color: "text-yellow-400" },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ReadoutCard({ experimentId, initialReadout, apiKey }: Props) {
  const [readout, setReadout] = useState<Readout | null>(initialReadout);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/readout`, {
        method: "POST",
        headers: { "X-API-Key": apiKey },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReadout(data.readout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate readout");
    } finally {
      setLoading(false);
    }
  };

  if (!readout) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">AI Readout</h3>
          <button
            onClick={regenerate}
            disabled={loading}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate readout"}
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          {error || "Click 'Generate readout' to get a plain-English summary of this experiment, powered by Amazon Bedrock and Claude Haiku 4.5."}
        </p>
      </div>
    );
  }

  const verdict = VERDICT_LABELS[readout.verdict] || { text: readout.verdict, color: "text-zinc-400" };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">AI Readout</div>
          <h3 className={`text-lg font-semibold ${verdict.color}`}>
            {verdict.text}
          </h3>
          <div className="text-xs text-zinc-500 mt-1">
            {CONFIDENCE_LABELS[readout.confidence] || readout.confidence} · Generated {new Date(readout.generated_at).toLocaleString()}
          </div>
        </div>
        <button
          onClick={regenerate}
          disabled={loading}
          className="text-xs px-3 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 disabled:opacity-50"
        >
          {loading ? "..." : "Regenerate"}
        </button>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed mb-3">{readout.summary}</p>
      <p className="text-sm text-amber-400">
        <span className="text-zinc-500">Recommendation: </span>
        {readout.recommendation}
      </p>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
```

## 8. Wire ReadoutCard into the experiment detail page

In `dashboard/app/(dashboard)/experiments/[id]/page.tsx`, add the ReadoutCard at the **top** of the page, **after** the header and **above** the SRM warning banner (if present).

Order should be:
1. Header (experiment name, status, hypothesis)
2. **ReadoutCard** ← NEW, only one section above everything
3. SRM warning banner (if present)
4. CUPED card
5. mSPRT card
6. Stats cards
7. Lift summary
8. Confidence band chart
9. Segment breakdown

Pass the initialReadout from the results API response. Use `caliper_demo_key_public` as the apiKey (read from env or hardcode for the demo).

## 9. Definition of done

Before declaring done, verify:

1. ✅ `npm run build` in dashboard/ succeeds with zero TypeScript errors
2. ✅ The readout API endpoint exists: `POST /api/experiments/[id]/readout`
3. ✅ Manually calling the endpoint via curl returns a structured readout (test with hero_cta_test's UUID)
4. ✅ The Bedrock call succeeds — model returns valid JSON parseable into the schema
5. ✅ The readout gets stored in Aurora `readouts` table — verify with `SELECT * FROM readouts ORDER BY generated_at DESC LIMIT 5;` in pgcli
6. ✅ The ReadoutCard renders on `/experiments/[id]` page
7. ✅ Clicking "Generate readout" produces a fresh narrative
8. ✅ Three test cases produce sensible different verdicts:
   - For `hero_cta_test`: should mention the mSPRT/classical p-value divergence and recommend continuing to collect data
   - For `buy_button_test`: should declare a verdict based on current numbers
   - For `nav_layout_test`: should call out SRM, recommend fixing randomization, NOT report a lift

## 10. Critical correctness — test the SRM case

The most important test for this phase: when SRM is detected, the readout MUST refuse to declare a winner. Do this manually:

```bash
# Get nav_layout_test UUID first (you have this — eb468601-559d-49d3-9cc0-50a7c286854f)
curl -X POST "https://caliper-xi.vercel.app/api/experiments/eb468601-559d-49d3-9cc0-50a7c286854f/readout" \
  -H "X-API-Key: caliper_demo_key_public"
```

The returned `verdict` must be `srm_invalidated`. The summary must mention "sample ratio mismatch" or "randomization issue" or equivalent. It must NOT say "treatment won by X%".

If the readout incorrectly declares a winner despite SRM, the prompt is too weak — strengthen the SYSTEM_PROMPT until the model reliably catches this.

## 11. When done

Show me:

1. List of files created/modified
2. Output of `npm run build` (must be clean)
3. Three curl test results — readout for each experiment (hero_cta_test, buy_button_test, nav_layout_test)
4. SQL query result showing readouts in the Aurora table
5. Screenshot of the experiment detail page with the readout card rendered at the top

If anything fails or you hit a wall, stop and tell me. Don't paper over errors.

---

Begin. Read this whole document first, then execute Sections 3 → 4 → 5 → 6 → 7 → 8 in order.
