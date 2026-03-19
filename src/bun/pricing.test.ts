import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetPricingStateForTests, computeCost, prefetchPricing } from "./pricing";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetPricingStateForTests();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("computeCost", () => {
  test("matches codexbar-style codex billing for cached input without billing reasoning separately", () => {
    const cost = computeCost(
      {
        // Codex parser stores non-cached input and non-reasoning output separately.
        inputTokens: 500,
        outputTokens: 90,
        cacheReadTokens: 250,
        cacheWriteTokens: 0,
        reasoningTokens: 10,
      },
      "gpt-5-codex",
    );

    expect(cost).not.toBeNull();
    expect(cost ?? 0).toBeCloseTo(0.00155625, 12);
  });

  test("returns zero for openrouter free models", () => {
    const cost = computeCost(
      {
        inputTokens: 10_000,
        outputTokens: 2_000,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
        reasoningTokens: 200,
      },
      "openrouter/openai/gpt-5:free",
    );

    expect(cost).toBe(0);
  });

  test("uses local pricing for gpt-5.4-mini", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 200_000,
      cacheWriteTokens: 100_000,
      reasoningTokens: 0,
    };

    const expected =
      0.75 + // input
      (500_000 * 4.5) / 1_000_000 + // output
      (200_000 * 0.075) / 1_000_000; // cache read

    expect(computeCost(usage, "gpt-5.4-mini") ?? 0).toBeCloseTo(expected, 12);
  });

  test("prefers local pricing over remote pricing for known models", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5.2-codex": {
                id: "gpt-5.2-codex",
                cost: {
                  input: 9,
                  output: 27,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000,
      outputTokens: 120,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
      reasoningTokens: 30,
    };

    const expectedLocal =
      (usage.inputTokens * 1.75) / 1_000_000 +
      (usage.outputTokens * 14) / 1_000_000 +
      (usage.cacheReadTokens * 0.175) / 1_000_000;

    expect(computeCost(usage, "gpt-5.3-codex") ?? 0).toBeCloseTo(expectedLocal, 12);
    expect(computeCost(usage, "gpt-5.2-codex") ?? 0).toBeCloseTo(expectedLocal, 12);
  });

  test("does not match unknown model names via remote substring", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5": {
                id: "gpt-5",
                cost: {
                  input: 1.25,
                  output: 10,
                  cache_read: 0.125,
                  cache_write: 0,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000,
      outputTokens: 120,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
      reasoningTokens: 30,
    };

    expect(computeCost(usage, "gpt-5")).not.toBeNull();
    expect(computeCost(usage, "foo-gpt-5")).toBeNull();
  });

  test("uses models.dev pricing when model is not in local table", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          acme: {
            id: "acme",
            models: {
              "acme-1": {
                id: "acme-1",
                cost: {
                  input: 3,
                  output: 12,
                  cache_read: 0.5,
                  cache_write: 0.25,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 100_000,
      cacheWriteTokens: 20_000,
      reasoningTokens: 50_000,
    };

    const expected =
      3 + // input
      (500_000 * 12) / 1_000_000 + // output
      (100_000 * 0.5) / 1_000_000 + // cache read
      (20_000 * 0.25) / 1_000_000; // cache write

    expect(computeCost(usage, "acme-1") ?? 0).toBeCloseTo(expected, 12);
  });

  test("does not retry remote pricing fetch during cooldown after failure", async () => {
    let fetchCalls = 0;
    globalThis.fetch = ((async () => {
      fetchCalls += 1;
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    await prefetchPricing();
    await prefetchPricing();

    expect(fetchCalls).toBe(1);
  });

  test("prefers exact provider/model pricing for provider-qualified model names", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5": {
                id: "gpt-5",
                cost: {
                  input: 1,
                  output: 1,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
          },
          openrouter: {
            id: "openrouter",
            models: {
              "openai/gpt-5": {
                id: "openai/gpt-5",
                cost: {
                  input: 9,
                  output: 9,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    expect(computeCost(usage, "gpt-5") ?? 0).toBeCloseTo(1.25, 12);
    expect(computeCost(usage, "openrouter/openai/gpt-5") ?? 0).toBeCloseTo(9, 12);
  });
});
