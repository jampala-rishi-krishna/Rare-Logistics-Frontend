// Structured Ask answer blocks (approved design, docs/design/order-tracker/reference-desktop-ask.html).
// Every value shown here comes from the server-built `blocks` (tool results only) - nothing is parsed out of model text.
import type { ReactElement } from "react";
import { useLocation } from "wouter";
import { Camera, CircleHelp } from "lucide-react";
import type { AnswerBlock } from "@/services/api/orderTracker";
import { CallLogistics, Chip, SourceLine, StatusChip } from "./ui";
import { SafeMarkdown } from "./SafeMarkdown";
import "./ask.css";

type Block<K extends AnswerBlock["type"]> = Extract<AnswerBlock, { type: K }>;

/** Only same-origin app paths returned by the server become navigation. */
export function safeLink(link: string | null | undefined): string | null {
  if (!link || typeof link !== "string") return null;
  return link.startsWith("/") && !link.startsWith("//") ? link : null;
}
/** The order number from a server link's `order=` param, or null. */
export function orderFromLink(link: string | null | undefined): string | null {
  const safe = safeLink(link);
  if (!safe) return null;
  try { return new URL(safe, "http://app.local").searchParams.get("order") || null; } catch { return null; }
}

/** Block-level source line, only when it says something the card footer does not. */
function BlockSource({ source, asOf, footerSources }: { source: string; asOf: string | null; footerSources: string[] }) {
  if (!source || (footerSources.length === 1 && footerSources[0] === source)) return null;
  return <div className="otq-block-src"><SourceLine source={`Source: ${source}`} asOf={asOf} /></div>;
}

function OrderTable({ block, onOpenOrder, footerSources }: { block: Block<"order_table">; onOpenOrder: (n: string) => void; footerSources: string[] }) {
  return <>
    <div className="otq-table" role="region" aria-label="Orders in this answer" tabIndex={0}>
      <table className="otq-table-inner">
        <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Result</th><th scope="col">Reason</th><th scope="col">Rejected</th></tr></thead>
        <tbody>{block.rows.map(row => <tr key={row.number}>
          <td><button type="button" className="otq-order-link" onClick={() => onOpenOrder(row.number)}>{row.number}</button></td>
          <td className="otq-strong-600">{row.customer}</td>
          <td><StatusChip status={row.status} /></td>
          <td>{row.reason || "—"}</td>
          <td className={row.rejected ? "otq-strong-700" : undefined}>{row.rejected || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <BlockSource source={block.source} asOf={block.as_of} footerSources={footerSources} />
  </>;
}

function Tiles({ block, footerSources }: { block: Block<"tiles">; footerSources: string[] }) {
  return <>
    <dl className="otq-tiles">{block.tiles.map((t, i) => <div className="otq-tile" key={`${t.label}-${i}`}>
      <dt>{t.label}</dt><dd className={t.tone ? `otq-tone-${t.tone}` : undefined}>{t.value}</dd>
    </div>)}</dl>
    <BlockSource source={block.source} asOf={block.as_of} footerSources={footerSources} />
  </>;
}

function Bars({ block, headline, footerSources }: { block: Block<"bars">; headline: string; footerSources: string[] }) {
  const max = Math.max(0, ...block.items.map(i => (Number.isFinite(i.value) ? i.value : 0)));
  const sameTitle = headline.trim().replace(/[.:]$/, "").toLowerCase().includes(block.title.trim().replace(/[.:]$/, "").toLowerCase());
  return <>
    {!sameTitle && block.title && <h3 className="otq-block-title">{block.title}</h3>}
    <ul className="otq-bars">{block.items.map((item, i) => {
      const pct = max > 0 && Number.isFinite(item.value) ? Math.max(0, Math.min(100, (item.value / max) * 100)) : 0;
      return <li className="otq-bar" key={`${item.label}-${i}`}>
        <span className="otq-bar-label">{item.label}</span>
        <span className="otq-bar-track" aria-hidden="true"><span className="otq-bar-fill" style={{ width: `${pct}%` }} /></span>
        <span className="otq-bar-value">{item.value.toLocaleString("en-PH")} {block.unit === "buyers" && item.value === 1 ? "buyer" : block.unit}</span>
      </li>;
    })}</ul>
    <BlockSource source={block.source} asOf={block.as_of} footerSources={footerSources} />
  </>;
}

/** Dashed "Not recorded" panel. `whole` = it is the whole answer card (rendered by AskThread); otherwise an inner box. */
export function NotRecorded({ block, extra, whole = false }: { block: Block<"not_recorded">; extra?: string; whole?: boolean }) {
  const Title = whole ? "p" : "h3";
  return <div className={whole ? "otq-nr" : "otq-nr otq-nr-inner"}>
    <span className="otq-nr-icon" aria-hidden="true"><CircleHelp size={22} strokeWidth={2} /></span>
    <div className="otq-nr-body">
      <Title className="otq-headline">{block.title}</Title>
      <p className="otq-nr-msg">{block.message}</p>
      {extra && <p className="otq-nr-msg"><SafeMarkdown text={extra} inlineOnly /></p>}
      <div className="otq-actions"><CallLogistics label="Ask Logistics" className="otq-btn-ink" /></div>
    </div>
  </div>;
}

function Actions({ block, onOpenOrder }: { block: Block<"actions">; onOpenOrder: (n: string) => void }) {
  const [, navigate] = useLocation();
  const items = block.actions.map(a => {
    const link = safeLink(a.link);
    const order = orderFromLink(a.link);
    if (a.kind === "open_order") return order ? { a, run: () => onOpenOrder(order) } : link ? { a, run: () => navigate(link) } : null;
    return link ? { a, run: () => navigate(link) } : null;
  }).filter(Boolean) as Array<{ a: Block<"actions">["actions"][number]; run: () => void }>;
  if (!items.length) return null;
  return <div className="otq-actions">{items.map(({ a, run }, i) =>
    <button type="button" key={`${a.kind}-${i}`} className="otq-btn-outline" onClick={run}>
      {a.kind === "photos" && <Camera size={17} strokeWidth={2} aria-hidden="true" />}{a.label}
    </button>)}</div>;
}

export function AnswerBlocks({ blocks, headline, footerSources, onOpenOrder }: { blocks: AnswerBlock[]; headline: string; footerSources: string[]; onOpenOrder: (n: string) => void }) {
  return <>{blocks.map((block, i) => {
    let body: ReactElement | null = null;
    switch (block.type) {
      case "order_table": body = block.rows?.length ? <OrderTable block={block} onOpenOrder={onOpenOrder} footerSources={footerSources} /> : null; break;
      case "tiles": body = block.tiles?.length ? <Tiles block={block} footerSources={footerSources} /> : null; break;
      case "bars": body = block.items?.length ? <Bars block={block} headline={headline} footerSources={footerSources} /> : null; break;
      case "not_recorded": body = <NotRecorded block={block} />; break;
      case "actions": body = block.actions?.length ? <Actions block={block} onOpenOrder={onOpenOrder} /> : null; break;
      default: body = null;
    }
    return body ? <div className={`otq-block otq-block-${block.type}`} key={i}>{body}</div> : null;
  })}</>;
}

/** The chip shown before the answer line (first tiles block with a chip), if any. */
export function headlineChip(blocks: AnswerBlock[] | undefined) {
  const tiles = blocks?.find((b): b is Block<"tiles"> => b.type === "tiles" && !!b.chip);
  return tiles?.chip ? <Chip tone={tiles.chip.tone} size="lg">{tiles.chip.label}</Chip> : null;
}
