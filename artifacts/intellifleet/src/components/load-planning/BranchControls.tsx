import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as inventoryApi from "@/services/api/inventory";
import { FilterField, buttonClass } from "./ToolbarControls";

/** Configured branches (always all of them) merged with any unknown branch the list response saw. */
export function useBranchOptions(seen?: inventoryApi.Branch[]) {
  const configured = useQuery({
    queryKey: ["load-planning-branches"],
    queryFn: () => inventoryApi.listBranches().then((response) => response.branches),
    staleTime: Infinity,
    retry: false,
  });
  return useMemo(() => {
    const merged = new Map<string, inventoryApi.Branch>();
    for (const branch of [...(configured.data ?? []), ...(seen ?? [])]) if (!merged.has(branch.id)) merged.set(branch.id, branch);
    return Array.from(merged.values());
  }, [configured.data, seen]);
}

const BADGE_TONES: Record<string, string> = {
  RGF: "bg-[#e9efe9] text-[#33673B]",
  MSSI: "bg-[#fbe9ea] text-[#86000B]",
  SSI: "bg-[#fff1d6] text-[#8a5a00]",
};

/** Small branch tag next to an SO number. Renders nothing when the order has no branch info. */
export function BranchBadge({ code, name }: { code?: string | null; name?: string | null }) {
  if (!code) return null;
  return (
    <span
      title={name ?? code}
      data-testid="branch-badge"
      className={`ml-1.5 inline-block rounded-[3px] px-1.5 py-[1px] align-middle text-[10px] font-semibold leading-4 tracking-wide ${BADGE_TONES[code] ?? "bg-[#ecebe7] text-[#4b4b4b]"}`}
    >
      {code}
    </span>
  );
}

/** Multi-select Branch filter, same 36px control as the other toolbar filters. Empty selection = All branches. */
export function BranchFilter({
  options,
  selected,
  counts,
  onChange,
}: {
  options: inventoryApi.Branch[];
  selected: string[];
  counts?: Record<string, number>;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const summary = !selected.length
    ? "All branches"
    : selected.length === 1
      ? (options.find((branch) => branch.id === selected[0])?.label ?? "1 branch")
      : `${selected.length} branches`;
  return (
    <FilterField label="Branch">
      <div className="relative min-w-0 w-full sm:w-[190px]">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open} aria-label="Branch filter" className={`${buttonClass} w-full !justify-between text-left font-medium text-black`}>
          <span className="truncate">{summary}</span>
          <span>▾</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-64 overflow-y-auto border border-[#d8d7d2] bg-white p-2 shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm font-semibold">
              <input type="checkbox" checked={!selected.length} onChange={() => onChange([])} />
              All branches
            </label>
            {options.map((branch) => (
              <label key={branch.id} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                <input type="checkbox" checked={selected.includes(branch.id)} onChange={() => toggle(branch.id)} />
                <span className="min-w-0 flex-1 truncate">{branch.label}</span>
                {counts && <span className="mono text-xs text-[#77787b]">{counts[branch.id] ?? 0}</span>}
              </label>
            ))}
          </div>
        )}
      </div>
    </FilterField>
  );
}
