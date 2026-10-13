import { vi } from "vitest";
vi.mock("@/lib/supabase/request-client", async () => {
  const { current } = await import("../../calibration/context");
  return { authenticatedRequestClient: async () => current().db };
});
vi.mock("@/lib/providers", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/providers")>();
  const { current } = await import("../../calibration/context");
  return {
    ...original,
    createLLMProvider: () => current().provider,
    createVisionProvider: () => ({
      recognize: async () => {
        if (current().turn.visionError)
          throw Error("SYNTHETIC_VISION_UNAVAILABLE");
        return current().turn.visionText || "";
      },
    }),
  };
});
vi.mock("@/lib/response-critic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/response-critic")>();
  const { current } = await import("../../calibration/context");
  return {
    ...actual,
    acceptResponse: async (
      generate: Parameters<typeof actual.acceptResponse>[0],
      context: Parameters<typeof actual.acceptResponse>[1],
      llm: Parameters<typeof actual.acceptResponse>[2],
    ) => {
      const run = current();
      run.criticContext = context;
      const trace = {
        candidates: [],
        flags: [],
        repairAttempted: false,
        fallbackUsed: false,
        fallbackObservation: "safe_response_field_equality" as const,
        context,
      } as import("../../calibration/types").CriticTrace;
      run.critic = trace;
      const accepted = await actual.acceptResponse(
        async (flags) => {
          if (flags) trace.repairAttempted = true;
          const candidate = await generate(flags);
          trace.candidates.push(structuredClone(candidate));
          return candidate;
        },
        context,
        llm,
      );
      trace.flags = accepted.flags;
      const safe = actual.safeResponse(context);
      trace.fallbackUsed = [
        "answer",
        "visualBlock",
        "teachingMethod",
        "hintLevel",
        "taskBlock",
      ].every(
        (k) =>
          JSON.stringify(
            accepted.result[k as keyof typeof accepted.result] ?? null,
          ) === JSON.stringify(safe[k as keyof typeof safe] ?? null),
      );
      return accepted;
    },
  };
});
export const realProviders =
  await vi.importActual<typeof import("@/lib/providers")>("@/lib/providers");
