import { describe, expect, it } from "vitest";
import { normalizeEnglishTranscript } from "@/lib/stt-normalization";

describe("English STT normalization", () => {
  it("removes a duplicated question opener from a short phrase", () => {
    expect(normalizeEnglishTranscript("How how are you")).toBe("How are you");
  });

  it("does not rewrite learner grammar", () => {
    expect(
      normalizeEnglishTranscript("Yesterday I go to school")
    ).toBe("Yesterday I go to school");
  });

  it("keeps meaningful emphasis repetitions", () => {
    expect(normalizeEnglishTranscript("very very good")).toBe("very very good");
  });
});
