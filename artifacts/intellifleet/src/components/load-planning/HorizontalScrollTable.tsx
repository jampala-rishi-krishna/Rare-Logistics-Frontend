import { ReactNode, useRef } from "react";

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

  const syncScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ) => {
    if (!source || !target || syncing.current) return;
    syncing.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className={className}>
      <div
        ref={topRef}
        className="load-planning-table-wrap sticky top-0 z-[5] hidden overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-[#e4e3df] bg-white md:block"
        onScroll={() => syncScroll(topRef.current, tableRef.current)}
        aria-hidden="true"
      >
        <div style={{ width: contentWidth, height: 1 }} />
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
