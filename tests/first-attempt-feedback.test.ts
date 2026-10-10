import { describe, expect, it } from "vitest";
import { buildFirstIncorrectAttemptHint } from "@/lib/first-attempt-feedback";

describe("first incorrect attempt feedback", () => {
  it("explains a first English error in Russian but keeps the practice target in English", () => {
    const hint = buildFirstIncorrectAttemptHint(
      "english",
      "My favourite hobby is read a book"
    );

    expect(hint).toContain("is read");
    expect(hint).toContain("по-английски");
    expect(hint).toMatch(/[А-Яа-яЁё]/);
    expect(hint.toLowerCase()).not.toContain("reading");
  });

  it("does not reveal the past form for a yesterday/go error", () => {
    const hint = buildFirstIncorrectAttemptHint(
      "english",
      "Yesterday I go to school with my friend."
    );

    expect(hint).toContain("yesterday");
    expect(hint).toContain("go");
    expect(hint).toContain("по-английски");
    expect(hint.toLowerCase()).not.toContain("went");
  });
});
