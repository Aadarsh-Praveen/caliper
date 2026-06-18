export type Variant = "control" | "treatment";

export interface CaliperConfig {
  apiBaseUrl?: string;
  apiKey?: string;
  debug?: boolean;
}

interface EventPayload {
  event_name: string;
  experiment_id: string;
  variant: string;
  properties: Record<string, unknown>;
  ts: string;
  context: Record<string, unknown>;
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
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getDeviceContext(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  let device = "desktop";
  if (/Mobi|Android/i.test(ua)) device = "mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "tablet";
  return { device, user_agent: ua };
}

class EventBuffer {
  private events: EventPayload[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly userId: () => string,
  ) {}

  add(event: EventPayload) {
    this.events.push(event);
    if (this.events.length >= 10) {
      void this.flush();
    } else if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => void this.flush(), 500);
    }
  }

  async flush() {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.events.length === 0) return;
    const batch = this.events.splice(0);
    try {
      await fetch(`${this.apiUrl}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({ user_id: this.userId(), events: batch }),
        keepalive: true,
      });
    } catch (e) {
      console.warn("[Caliper] track failed:", e);
    }
  }
}

export class CaliperClient {
  private config: CaliperConfig;
  // Maps experimentId → variant for all enrolled experiments
  private assignments = new Map<string, string>();
  private buffer: EventBuffer | null = null;

  constructor(config: CaliperConfig = {}) {
    this.config = { debug: false, ...config };
    if (typeof window !== "undefined" && config.apiBaseUrl && config.apiKey) {
      this.buffer = new EventBuffer(config.apiBaseUrl, config.apiKey, () => this.getUserId());
      window.addEventListener("beforeunload", () => {
        void this.buffer?.flush();
      });
    }
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

    // Check URL force-params in dev
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(window.location.search);
      const forceAll = params.get("caliper_force");
      if (forceAll === "control" || forceAll === "treatment") {
        this.assignments.set(experimentId, forceAll);
        return forceAll;
      }
      const forceSpecific = params.get(`caliper_force_${experimentId}`);
      if (forceSpecific === "control" || forceSpecific === "treatment") {
        this.assignments.set(experimentId, forceSpecific);
        return forceSpecific;
      }
    }

    if (this.config.apiBaseUrl && this.config.apiKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(
          `${this.config.apiBaseUrl}/api/assign?user_id=${encodeURIComponent(userId)}&experiment_id=${encodeURIComponent(experimentId)}`,
          {
            headers: { "X-API-Key": this.config.apiKey },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { variant?: string };
          if (data.variant === "control" || data.variant === "treatment") {
            this.assignments.set(experimentId, data.variant);
            return data.variant;
          }
        }
      } catch {
        // fall through to hash fallback
      }
    }

    const fallback = hashVariant(userId, experimentId);
    this.assignments.set(experimentId, fallback);
    return fallback;
  }

  async track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    if (typeof window === "undefined") return;

    const ts = new Date().toISOString();
    const context = getDeviceContext();

    // If no active assignments, we can't attribute the event — skip sending
    if (this.assignments.size === 0) {
      if (this.config.debug) {
        console.debug("[Caliper]", eventName, properties, "(no active experiments)");
      }
      return;
    }

    if (this.config.debug) {
      console.debug("[Caliper]", eventName, { ...properties, assignments: Object.fromEntries(this.assignments) });
    }

    if (!this.buffer) return;

    // Fan-out: send event attributed to each enrolled experiment
    for (const [expId, variant] of this.assignments) {
      this.buffer.add({
        event_name: eventName,
        experiment_id: expId,
        variant,
        properties: properties ?? {},
        ts,
        context,
      });
    }
  }

  async flushNow(): Promise<void> {
    await this.buffer?.flush();
  }

  reset(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("caliper_user_id");
    }
    this.assignments.clear();
  }
}

const apiBaseUrl = process.env.NEXT_PUBLIC_CALIPER_API_URL;
const apiKey = process.env.NEXT_PUBLIC_CALIPER_API_KEY;

export const caliper = new CaliperClient({
  debug: process.env.NODE_ENV !== "production",
  ...(apiBaseUrl && apiKey ? { apiBaseUrl, apiKey } : {}),
});
