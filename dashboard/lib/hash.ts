// cyrb53 — copied verbatim from web/lib/caliper/sdk.ts (bryc, public domain)
export function cyrb53(str: string, seed = 0): number {
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

export function assignVariant(
  userId: string,
  experimentId: string,
  variants: Array<{ name: string; allocation: number }>
): string {
  const hash = cyrb53(`${userId}:${experimentId}`);
  const bucket = hash % 100;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.allocation * 100;
    if (bucket < cumulative) return variant.name;
  }
  return variants[variants.length - 1].name;
}
