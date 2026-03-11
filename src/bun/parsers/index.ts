import type { SessionSource } from "../../shared/schema";
import type { FileCandidate } from "../discovery";
import { codexParser } from "./codex";
import { parseGeneric } from "./generic";
import type { RawParsedSession, SessionParser } from "./types";

const PARSERS: Partial<Record<SessionSource, SessionParser["parse"]>> = {
  codex: codexParser.parse,
};

export const parseFile = async (candidate: FileCandidate): Promise<RawParsedSession | null> => {
  try {
    const parser = PARSERS[candidate.source];
    if (parser) {
      const parsed = await parser(candidate);
      if (parsed) return parsed;
    }
    return await parseGeneric(candidate, candidate.source);
  } catch (error) {
    console.error(`[parse] Failed ${candidate.source} ${candidate.path}`, error);
    try {
      return await parseGeneric(candidate, candidate.source);
    } catch {
      return null;
    }
  }
};

export type { RawParsedSession } from "./types";
