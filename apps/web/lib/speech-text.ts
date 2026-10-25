/**
 * Turning Maverick's written replies into speakable text. Pure functions,
 * no browser APIs, so they're unit-tested (packages/core/test/speech-text.test.ts).
 */

/** Strip Markdown and things that sound wrong read aloud. */
export function toSpeakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " (code omitted) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/^#{1,6}\s+(.*)$/gm, "$1.")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
    // Emphasis split across sentence chunks leaves single markers behind: drop them.
    .replace(/(^|\s)[*_]+(?=\S)/g, "$1")
    .replace(/(\S)[*_]+(?=\s|$)/g, "$1")
    .replace(/\|/g, ", ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Feed streamed text in; get whole sentences out as soon as they're complete,
 * so speech can start long before the reply has finished arriving.
 */
export class SentenceChunker {
  private buf = "";

  /** Add streamed text; returns sentences that are now complete. */
  push(text: string): string[] {
    this.buf += text;
    const out: string[] = [];
    // Boundaries: end of sentence (. ! ? followed by whitespace), a blank line,
    // or a line break before a list item. Not decimals (3.5), abbreviations or list numbers.
    const re = /([.!?…]["')\]]*)(\s+)|\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/g;
    let start = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) {
      const end = m[1] !== undefined ? m.index + m[1].length : m.index;
      const candidate = this.buf.slice(start, end);
      if (m[1] !== undefined && (/\b(e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|approx|no)\.$/i.test(candidate) || /(^|\s)\d+\.$/.test(candidate))) continue;
      const spoken = toSpeakable(candidate);
      if (spoken) out.push(spoken);
      start = m.index + m[0].length;
    }
    this.buf = this.buf.slice(start);
    // Very long run-on text: speak it in pieces rather than waiting forever.
    if (this.buf.length > 400) {
      const cut = this.buf.lastIndexOf(", ", 300);
      if (cut > 80) {
        const spoken = toSpeakable(this.buf.slice(0, cut + 1));
        if (spoken) out.push(spoken);
        this.buf = this.buf.slice(cut + 2);
      }
    }
    return out;
  }

  /** The reply is complete: return whatever is left. */
  flush(): string[] {
    const rest = toSpeakable(this.buf);
    this.buf = "";
    return rest ? [rest] : [];
  }
}

/** Order of preference for a refined British male voice among the voices a device offers. */
const PREFERRED = [/Daniel.*(Premium|Enhanced)/i, /Arthur.*(Premium|Enhanced)/i, /Daniel/i, /Arthur/i, /Ryan.*Natural/i, /Thomas.*Natural/i, /Google UK English Male/i, /Ryan/i, /George/i, /Thomas/i];

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
}

export function pickBritishMale<T extends VoiceLike>(voices: T[]): T | undefined {
  const gb = voices.filter((v) => /^en[-_]GB/i.test(v.lang));
  for (const re of PREFERRED) {
    const hit = gb.find((v) => re.test(v.name)) ?? voices.find((v) => re.test(v.name) && /^en/i.test(v.lang));
    if (hit) return hit;
  }
  return gb[0];
}
