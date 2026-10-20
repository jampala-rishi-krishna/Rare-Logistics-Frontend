import { Fragment, type ReactNode } from "react";

// Deliberately small Markdown renderer: React text nodes only. No HTML parsing,
// injected markup, images or model-provided links; evidence links have their own UI.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\n)/g).map((part, i) => {
    if (part === "\n") return <br key={i} />;
    if (/^(\*\*|__)/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function SafeMarkdown({ text, inlineOnly = false }: { text: string; inlineOnly?: boolean }) {
  if (inlineOnly) return <>{inline(text)}</>;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const result: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    const list = /^\s*(?:([-+*])|\d+\.)\s+(.+)$/.exec(lines[i]);
    if (list) {
      const ordered = !list[1], items: ReactNode[] = [];
      while (i < lines.length) {
        const match = /^\s*(?:([-+*])|\d+\.)\s+(.+)$/.exec(lines[i]);
        if (!match || !match[1] !== ordered) break;
        items.push(<li key={i}>{inline(match[2])}</li>); i++;
      }
      result.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else {
      const paragraph: string[] = [];
      do { paragraph.push(lines[i++].replace(/^#{1,6}\s+/, "")); }
      while (i < lines.length && lines[i].trim() && !/^\s*(?:[-+*]|\d+\.)\s+/.test(lines[i]));
      result.push(<p key={i}>{inline(paragraph.join("\n"))}</p>);
    }
  }
  return <>{result}</>;
}
