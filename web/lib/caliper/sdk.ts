export type Variant = "control" | "treatment";

export interface CaliperConfig {
  apiBaseUrl?: string;
  debug?: boolean;
}

// cyrb53 — public domain hash by bryc (github.com/bryc/code/blob/master/jshash)
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashVariant(userId: string, experimentId: string): Variant {
  return cyrb53(`${userId}:${experimentId}`) % 100 < 50 ? "control" : "treatment";
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class CaliperClient {
  private config: CaliperConfig;

  constructor(config: CaliperConfig = {}) {
    this.config = { debug: true, ...config };
  }

  getUserId(): string {
    if (typeof window === "undefined") return "ssr-placeholder";
    let id = localStorage.getItem("caliper_user_id");
    if (!id) {
      id = generateId();
      localStorage.setItem("caliper_user_id", id);
    }
    return id;
  }

  async assign(experimentId: string): Promise<Variant> {
    const userId = this.getUserId();
    if (this.config.apiBaseUrl) {
      try {
        const res = await fetch(
          `${this.config.apiBaseUrl}/api/assign?user_id=${encodeURIComponent(userId)}&experiment_id=${encodeURIComponent(experimentId)}`
        );
        const data = (await res.json()) as { variant?: string };
        if (data.variant === "control" || data.variant === "treatment") {
          return data.variant;
        }
      } catch {
        // fall through to hash fallback
      }
    }
    return hashVariant(userId, experimentId);
  }

  async track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    if (typeof window === "undefined") return;
    const payload = {
      event: eventName,
      user_id: this.getUserId(),
      timestamp: new Date().toISOString(),
      properties,
    };
    if (this.config.debug) {
      console.debug("[Caliper]", eventName, payload);
    }
    if (this.config.apiBaseUrl) {
      fetch(`${this.config.apiBaseUrl}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }

  reset(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("caliper_user_id");
    }
  }
}

export const caliper = new CaliperClient({ debug: true });
