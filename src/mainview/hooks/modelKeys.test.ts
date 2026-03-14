import { describe, expect, test } from "bun:test";
import { EMPTY_TOKEN_USAGE } from "@shared/schema";
import { collectModelKeys } from "./modelKeys";

const makeModelEntry = (model: string) => ({
  model,
  sessions: 1,
  tokens: { ...EMPTY_TOKEN_USAGE },
  costUsd: 0,
});

describe("collectModelKeys", () => {
  test("preserves exact model keys while dropping blank values", () => {
    const result = collectModelKeys([
      makeModelEntry("gpt-5"),
      makeModelEntry(" gpt-5 "),
      makeModelEntry(""),
      makeModelEntry("   "),
      makeModelEntry("custom-model"),
    ]);

    expect(result).toEqual(["gpt-5", " gpt-5 ", "custom-model"]);
  });

  test("deduplicates exact duplicate keys in insertion order", () => {
    const result = collectModelKeys([
      makeModelEntry("gpt-5"),
      makeModelEntry("gpt-5"),
      makeModelEntry("custom-model"),
      makeModelEntry("custom-model"),
    ]);

    expect(result).toEqual(["gpt-5", "custom-model"]);
  });
});
