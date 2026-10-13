import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { mirroredScrollLeft, topScrollbarWidth } from "../../lib/scrollSync";

type HorizontalScrollTableProps = {
  children: ReactNode;
  className?: string;
  contentWidth: string;
};

export function HorizontalScrollTable({
  children,
  className = "",
  contentWidth,
}: HorizontalScrollTableProps) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);
  const [innerWidth, setInnerWidth] = useState<number | null>(null);

  const measure = useCallback(() => {
    const wrap = tableRef.current;
    if (!wrap) return;
    // The real content width is the scroll width of the wrap (its table child may be wider than the wrap).
    const next = topScrollbarWidth(wrap.scrollWidth, wrap.clientWidth);
    setInnerWidth((prev) => (prev === next ? prev : next));
  }, []);

  // Recalculate after every render (data / column changes alter the table's width) ...
  useLayoutEffect(() => {
    measure();
  });

  // ... and on container/table resize (window resize, column changes, async content).
  useEffect(() => {
    const wrap = tableRef.current;
    if (!wrap) return;
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(wrap);
      Array.from(wrap.children).forEach((child) => observer?.observe(child));
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, children]);

  const syncScroll = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (!source || !target || syncing.current) return;
    syncing.current = true;
    target.scrollLeft = mirroredScrollLeft(source.scrollLeft, target.scrollWidth, target.clientWidth);
    window.requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className={className}>
      <div
        ref={topRef}
        className="load-planning-top-scroll sticky top-[68px] z-[15] hidden h-5 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-[#e4e3df] bg-white md:block"
        onScroll={() => syncScroll(topRef.current, tableRef.current)}
        aria-hidden="true"
      >
        <div style={{ width: innerWidth ?? contentWidth, height: 1 }} />
      </div>
      <div
        ref={tableRef}
        className="load-planning-table-wrap hidden overflow-x-auto overscroll-x-contain md:block"
        onScroll={() => syncScroll(tableRef.current, topRef.current)}
      >
        {children}
      </div>
    </div>
  );
}
