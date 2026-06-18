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
