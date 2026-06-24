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
  summary: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  raw_response: string;
}

const SYSTEM_PROMPT = `You are a senior product analyst at Caliper, a B2B A/B testing platform.
You generate plain-English readouts of A/B test results for product managers who are not statisticians.

Your tone: confident, calibrated, no jargon. Lead with the verdict. Acknowledge uncertainty when present.
Length: exactly 2-5 sentences for the summary, 1 sentence for the recommendation.

Critical rules:
- If SRM is detected, the verdict MUST be "srm_invalidated" — do not report a lift number, do not say which variant won. The summary must say the underlying randomization is broken and results cannot be trusted.
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

/**
 * Generate a plain-English A/B test readout via Amazon Bedrock (Claude).
 *
 * Sends experiment statistics to the configured Bedrock model with a structured prompt
 * that instructs the model to produce a JSON response. Falls back to BEDROCK_FALLBACK_MODEL_ID
 * if the primary model throws. The prompt enforces strict verdict types:
 * "treatment_wins" | "control_wins" | "no_significant_difference" | "srm_invalidated" | "insufficient_data".
 * SRM detection always overrides to "srm_invalidated" regardless of p-value.
 *
 * @param input - Experiment statistics and metadata for the prompt.
 * @returns Parsed readout with verdict, summary, recommendation, and confidence.
 * @throws {Error} If the Bedrock response does not contain parseable JSON or is missing required fields.
 */
export async function generateReadout(input: BedrockReadoutInput): Promise<BedrockReadout> {
  const userPrompt = buildUserPrompt(input);

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 600,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const command = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  let response;
  try {
    response = await bedrock.send(command);
  } catch (primaryError) {
    console.warn("[Bedrock] Primary model failed, trying fallback:", primaryError);
    response = await invokeWithFallback(userPrompt);
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
    lines.push(
      `  ${v.name}: n=${v.n.toLocaleString()}, ${v.conversions} conversions, ${(v.conversion_rate * 100).toFixed(2)}% rate`
    );
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
    lines.push(`The underlying randomization is broken. Results cannot be trusted. Verdict MUST be srm_invalidated.`);
  }

  return lines.join("\n");
}

function parseReadoutResponse(rawText: string): BedrockReadout {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in Bedrock response: ${rawText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

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

async function invokeWithFallback(userPrompt: string) {
  const command = new InvokeModelCommand({
    modelId: env.BEDROCK_FALLBACK_MODEL_ID,
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
