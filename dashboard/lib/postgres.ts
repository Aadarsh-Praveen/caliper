import { Pool } from "pg";
import { env } from "./env";

// Strip sslmode from the URL — pg-connection-string v2 treats sslmode=require as verify-full,
// which breaks self-signed Aurora certs. We handle SSL exclusively via the ssl Pool option below.
const cleanUrl = env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

/**
 * Shared Aurora Postgres connection pool (max 10 connections, 30s idle timeout).
 * SSL is enforced with rejectUnauthorized: false to allow Aurora's self-signed certificate.
 */
export const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Execute a parameterized SQL query and return typed rows.
 *
 * @param text - SQL query string with $1, $2, ... placeholders.
 * @param params - Positional parameter values.
 * @returns Array of result rows typed as T.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Execute a parameterized SQL query and return the first row, or null if no rows.
 *
 * @param text - SQL query string with $1, $2, ... placeholders.
 * @param params - Positional parameter values.
 * @returns The first result row typed as T, or null.
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
