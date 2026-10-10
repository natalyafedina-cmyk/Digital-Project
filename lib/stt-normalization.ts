const QUESTION_OPENERS = new Set([
  "how",
  "what",
  "where",
  "when",
  "why",
  "who",
  "which",
  "can",
  "do",
  "does",
  "did",
  "is",
  "are",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
]);

export function normalizeEnglishTranscript(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 3 || tokens.length > 8) return trimmed;

  const first = tokens[0].toLowerCase().replace(/[^a-z']/g, "");
  const second = tokens[1].toLowerCase().replace(/[^a-z']/g, "");

  if (
    first &&
    first === second &&
    QUESTION_OPENERS.has(first)
  ) {
    return [tokens[0], ...tokens.slice(2)].join(" ");
  }

  return trimmed;
}
