import { AsyncLocalStorage } from "node:async_hooks";
import type { LLMProvider } from "@/lib/providers/types";
import type { Scenario, TurnSpec, CallTrace, CriticTrace } from "./types";
import type { MemoryDB } from "./memory-db";
import type { CriticContext } from "@/lib/response-critic";
export type RunContext = {
  cancelled?: boolean;
  scenario: Scenario;
  turn: TurnSpec;
  db: MemoryDB;
  provider: LLMProvider;
  calls: CallTrace[];
  critic: CriticTrace | null;
  criticContext: CriticContext | null;
};
export const storage = new AsyncLocalStorage<RunContext>();
export function current() {
  const c = storage.getStore();
  if (!c) throw Error("Calibration request outside isolated context");
  return c;
}
