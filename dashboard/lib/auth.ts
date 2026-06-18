import { createHash } from "crypto";
import { queryOne } from "./postgres";
import type { Customer } from "./types";

export async function getCustomerByApiKey(apiKey: string): Promise<Customer | null> {
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return queryOne<Customer>(
    `SELECT id, slug, plan FROM customers WHERE api_key_hash = $1`,
    [hash]
  );
}

export function getApiKeyFromRequest(req: Request): string | null {
  return req.headers.get("X-API-Key");
}
