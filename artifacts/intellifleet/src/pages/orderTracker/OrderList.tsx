// Left column of the Order Tracker page: the orders of the current filter, newest update first (approved design,
// docs/design/order-tracker/Desktop___Orders___order_details.png). Server paging (50 per page) is preserved; sorting is
// client-side within the page.
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import * as tracker from "@/services/api/orderTracker";
import { CallLogistics, PaymentChip, SectionError, Skeleton, StatusChip, ago, hhmm, paymentTone } from "./ui";
import "./list.css";

export const PAGE_SIZE = 50;
const COLLAPSED = 6;

const time = (value: string | null | undefined) => { const t = value ? new Date(value).getTime() : NaN; return Number.isNaN(t) ? -Infinity : t; };

function meta(row: tracker.OrderRow): string {
  if (!row.truck) return "Not assigned to a truck yet";
  const parts = [row.truck];
  if (row.stop && row.total_stops) parts.push(`stop ${row.stop} of ${row.total_stops}`);
  if (row.event?.label) parts.push(row.event.at ? `${row.event.label} ${hhmm(row.event.at)}` : row.event.label);
  return parts.join(" · ");
}

export interface OrderListProps {
  data: tracker.OrderList | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selected: string | null;
  isToday: boolean;
  ownOrdersOnly: boolean;
  hrefFor: (number: string) => string;
  onOpen: (number: string) => void;
  offset: number;
  onPage: (offset: number) => void;
}

export function OrderList({ data, loading, error, onRetry, selected, isToday, ownOrdersOnly, hrefFor, onOpen, offset, onPage }: OrderListProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => [...(data?.orders ?? [])].sort((a, b) => time(b.last_update) - time(a.last_update)), [data]);
  const total = data?.total ?? 0;
  const selectedIndex = selected ? rows.findIndex(r => r.number === selected) : -1;
  const collapsed = !expanded && rows.length > COLLAPSED && selectedIndex < COLLAPSED;
  const visible = collapsed ? rows.slice(0, COLLAPSED) : rows;
  const paged = total > PAGE_SIZE;
  const count = `${total} ${total === 1 ? "order" : "orders"}${isToday ? " today" : ""}`;

  function click(event: MouseEvent<HTMLAnchorElement>, number: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(number);
  }

  return <section className="otl" aria-label="Orders" aria-busy={loading || undefined}>
    <div className="otl-head">
      <h2 className="otl-count">{data ? count : loading ? "Loading orders…" : "Orders"}</h2>
      <span className="otl-sort">Newest update first</span>
    </div>
    {loading && !data && <div role="status" aria-label="Loading your orders">{[0, 1, 2, 3, 4].map(i => <div className="otl-row otl-skel" key={i}>
      <div className="otl-main"><Skeleton h={18} w="55%" /><Skeleton h={16} w="70%" /><Skeleton h={14} w="45%" /></div>
      <div className="otl-side"><Skeleton h={20} w={64} r={10} /><Skeleton h={12} w={48} /></div>
    </div>)}</div>}
    {error && !loading && <div className="otl-pad"><SectionError message={error} onRetry={onRetry} /></div>}
    {data && !error && (rows.length === 0
      ? <div className="otl-empty">
          <p className="otl-empty-title">No orders for this date or search.</p>
          {ownOrdersOnly
            ? <p>You see orders where you are the recorded salesperson. If one is missing, Logistics can check the salesperson on the order.</p>
            : <p>Try another date, filter or reference.</p>}
          <CallLogistics variant="outline" />
        </div>
      : <>
          <ul className="otl-rows">
            {visible.map(row => {
              const current = row.number === selected;
              const showPay = !!row.payment && paymentTone(row.payment) !== "unknown";
              return <li key={row.number}>
                <a className={`otl-row${current ? " otl-current" : ""}`} href={hrefFor(row.number)} aria-current={current ? "true" : undefined} onClick={e => click(e, row.number)}>
                  <div className="otl-main">
                    <div className="otl-top"><span className="otl-num">{row.number}</span><StatusChip status={row.status} at={row.checkout_at ?? row.event?.at} /></div>
                    <div className="otl-cust">{row.customer}</div>
                    <div className="otl-meta">{meta(row)}</div>
                  </div>
                  <div className="otl-side">
                    {showPay && <PaymentChip status={row.payment} />}
                    <span className="otl-ago">{ago(row.last_update)}</span>
                  </div>
                </a>
              </li>;
            })}
          </ul>
          {collapsed && <div className="otl-foot"><button type="button" className="otl-more" onClick={() => setExpanded(true)}>{paged ? `Show all ${rows.length} on this page` : `Show all ${total} orders`}</button></div>}
          {paged && <div className="otl-foot otl-pager">
            <button type="button" className="otl-page" disabled={offset === 0} onClick={() => { setExpanded(false); onPage(Math.max(0, offset - PAGE_SIZE)); }}>Previous</button>
            <span className="otl-range">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
            <button type="button" className="otl-page" disabled={offset + PAGE_SIZE >= total} onClick={() => { setExpanded(false); onPage(offset + PAGE_SIZE); }}>Next</button>
          </div>}
        </>)}
  </section>;
}
