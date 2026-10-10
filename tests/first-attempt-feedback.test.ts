import { describe, expect, it } from "vitest";
import { buildFirstIncorrectAttemptHint } from "@/lib/first-attempt-feedback";

describe("first incorrect attempt feedback", () => {
  it("keeps English conversation feedback in simple English", () => {
    const hint = buildFirstIncorrectAttemptHint(
      "english",
      "My favourite hobby is read a book"
    );

    expect(hint).toContain("is read");
    expect(hint).not.toContain("reading");
    expect(hint).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("does not reveal the past form for a yesterday/go error", () => {
    const hint = buildFirstIncorrectAttemptHint(
      "english",
      "Yesterday I go to school with my friend."
    );

    expect(hint).toContain("yesterday");
    expect(hint).toContain("go");
    expect(hint.toLowerCase()).not.toContain("went");
  });
});
