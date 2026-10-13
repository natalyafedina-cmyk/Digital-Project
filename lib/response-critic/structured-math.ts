// Generic visual scaffold; operands come from content, never a topic-specific patch.
export function blankColumnScaffold(text: string): string | null {
  const match = [...text.matchAll(/(\d{1,8})\s*[×xX*]\s*(\d{1,8})/g)].at(-1);
  if (!match) return null;
  const top = match[1], bottom = match[2], width = Math.max(top.length + bottom.length, bottom.length + 2);
  const blank = "_".repeat(width);
  return [top.padStart(width), ("× " + bottom).padStart(width), "-".repeat(width), blank, blank, "-".repeat(width), blank].join("\n");
}
