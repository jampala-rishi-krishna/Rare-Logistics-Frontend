import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  parse: (code: string) => Promise<unknown> | unknown;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;

async function loadMermaid(): Promise<MermaidApi> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "#f2f2ef",
      mainBkg: "#ffffff",
      primaryColor: "#ffffff",
      primaryTextColor: "#0b0b0b",
      primaryBorderColor: "#d8d7d2",
      lineColor: "#55565a",
      textColor: "#0b0b0b",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    },
  });
    return mermaid as MermaidApi;
  });
  return mermaidPromise;
}

type Part =
  | { type: "mermaid"; code: string }
  | { type: "table"; lines: string[] }
  | { type: "text"; text: string };

function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
    .filter(Boolean)
    .map((part, index) => {
      const bold =
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"));
      return bold ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>;
    });
}

export function parseAssistantMessage(text: string): Part[] {
  const parts: Part[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const fence = lines[i].match(/^```(\w[\w-]*)?\s*$/);
    if (fence) {
      const lang = (fence[1] || "").toLowerCase();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      if (lang === "mermaid") parts.push({ type: "mermaid", code: body.join("\n").trim() });
      else parts.push({ type: "text", text: body.join("\n") });
      continue;
    }

    if (isTableStart(lines, i)) {
      const table: string[] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        table.push(lines[i]);
        i += 1;
      }
      parts.push({ type: "table", lines: table });
      continue;
    }

    const textLines: string[] = [];
    while (i < lines.length && !/^```/.test(lines[i]) && !isTableStart(lines, i)) {
      textLines.push(lines[i]);
      i += 1;
    }
    parts.push({ type: "text", text: textLines.join("\n") });
  }

  return parts.filter((part) => part.type !== "text" || part.text.length > 0);
}

export function messageContainsMermaidBlock(text: string): boolean {
  return parseAssistantMessage(text).some((part) => part.type === "mermaid");
}

function isTableStart(lines: string[], index: number) {
  return (
    index + 1 < lines.length &&
    /^\s*\|.+\|\s*$/.test(lines[index]) &&
    /^\s*\|?[\s:-]+\|[\s|:-]*\|?\s*$/.test(lines[index + 1])
  );
}

function parseTable(lines: string[]) {
  const rows = lines
    .filter((_, index) => index !== 1)
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  return { head: rows[0] || [], body: rows.slice(1) };
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="agent-rich-text">
      {lines.map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        const heading = line.match(/^\s*#{1,3}\s+(.+)$/);
        if (!line.trim()) return <div className="h-2" key={index} />;
        if (bullet) return <div className="agent-bullet" key={index}>{renderInline(bullet[1])}</div>;
        if (heading) return <div className="mb-1 font-semibold" key={index}>{renderInline(heading[1])}</div>;
        return <div key={index}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const table = parseTable(lines);
  return (
    <div className="agent-table-wrap">
      <table className="agent-table">
        <thead>
          <tr>{table.head.map((cell, index) => <th key={`${cell}-${index}`}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {table.body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MermaidBlock({ code, index }: { code: string; index: number }) {
  const [svg, setSvg] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const id = useRef(`agent-mermaid-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setInvalid(false);
    setLoading(true);

    loadMermaid()
      .then((mermaid) =>
        Promise.resolve()
      .then(() => mermaid.parse(code))
          .then(() => mermaid.render(id.current, code)),
      )
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvalid(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const download = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `intellifleet-diagram-${index + 1}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (invalid) {
    return (
      <div className="agent-diagram-fallback">
        <div className="font-semibold">Diagram couldn't be drawn.</div>
        <details className="mt-2">
          <summary>Show Mermaid code</summary>
          <pre>{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="agent-diagram">
      <div className="agent-diagram-actions">
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy Mermaid code"}</button>
        <button type="button" onClick={download} disabled={!svg}>Download SVG</button>
      </div>
      {loading && !svg ? (
        <div className="agent-diagram-placeholder">Drawing diagram...</div>
      ) : (
        <div className="agent-diagram-canvas" dangerouslySetInnerHTML={{ __html: svg || "" }} />
      )}
    </div>
  );
}

export function RichAssistantMessage({ text }: { text: string }) {
  const parts = useMemo(() => parseAssistantMessage(text), [text]);
  let diagramIndex = 0;

  return (
    <div className="agent-rich-message">
      {parts.map((part, index) => {
        if (part.type === "mermaid") return <MermaidBlock code={part.code} index={diagramIndex++} key={index} />;
        if (part.type === "table") return <MarkdownTable lines={part.lines} key={index} />;
        return <TextBlock text={part.text} key={index} />;
      })}
    </div>
  );
}
