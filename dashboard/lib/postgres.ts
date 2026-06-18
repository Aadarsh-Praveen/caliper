import { Pool } from "pg";
import { env } from "./env";

// Strip sslmode from the URL — pg-connection-string v2 treats sslmode=require as verify-full,
// which breaks self-signed Aurora certs. We handle SSL exclusively via the ssl Pool option below.
const cleanUrl = env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

export const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
