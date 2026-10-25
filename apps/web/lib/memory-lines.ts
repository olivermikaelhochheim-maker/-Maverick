/**
 * Browser copy of the server's line parser (packages/core/src/memory parseMemoryLines),
 * used only to preview the count. The server re-parses and is authoritative.
 */
export function parseMemoryLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```") && !/^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/, "").trim())
    .map((l) => l.replace(/^["“](.*)["”]$/, "$1").trim())
    .filter(Boolean);
}
