import { describe, test, expect } from "vitest";
import { cyrb53, assignVariant } from "../hash";

describe("cyrb53", () => {
  test("matches SDK output for 'hello'", () => {
    expect(cyrb53("hello", 0)).toBe(4625896200565286);
  });

  test("matches SDK output for 'test_user:hero_cta_test'", () => {
    expect(cyrb53("test_user:hero_cta_test", 0)).toBe(5020703963063620);
  });
});

describe("assignVariant", () => {
  test("returns a valid variant name", () => {
    const variants = [
      { name: "control", allocation: 0.5 },
      { name: "treatment", allocation: 0.5 },
    ];
    const result = assignVariant("test_user", "hero_cta_test", variants);
    expect(["control", "treatment"]).toContain(result);
  });

  test("is deterministic for the same user+experiment", () => {
    const variants = [
      { name: "control", allocation: 0.5 },
      { name: "treatment", allocation: 0.5 },
    ];
    const r1 = assignVariant("user-abc", "exp-1", variants);
    const r2 = assignVariant("user-abc", "exp-1", variants);
    expect(r1).toBe(r2);
  });
});
