import { Fragment, type ReactNode } from "react";

/**
 * Tiny, safe Markdown renderer for assistant replies: paragraphs, headings,
 * lists, code blocks, inline code, bold, italics and links. It builds React
 * elements directly (never raw HTML), so model output cannot inject script.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(<pre key={key++}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = inline(line.replace(/^#+\s*/, ""));
      blocks.push(level <= 2 ? <h2 key={key++}>{content}</h2> : <h3 key={key++} style={{ textTransform: "none", letterSpacing: 0 }}>{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const lis = items.map((it, n) => <li key={n}>{inline(it)}</li>);
      blocks.push(ordered ? <ol key={key++}>{lis}</ol> : <ul key={key++}>{lis}</ul>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={key++}>
        {para.map((l, n) => (
          <Fragment key={n}>{n > 0 && <br />}{inline(l)}</Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else if (m[4]) {
      const label = tok.slice(1, tok.indexOf("]("));
      out.push(<a key={k++} href={m[5]} target="_blank" rel="noopener noreferrer nofollow">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
