/** Pure helpers for the PO tab's status filter. */

export const PO_HIDDEN_BY_DEFAULT = ["cancelled", "closed"];

/** "partially_received" -> "Partially Received". */
export function poStatusLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "-";
  return text
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Status options with counts: every status seen in the date range plus any already selected, sorted by label. */
export function poStatusOptions(counts: Record<string, number> | undefined, selected: string[] = []): { value: string; label: string; count: number }[] {
  const values = new Set([...Object.keys(counts ?? {}), ...selected]);
  return Array.from(values)
    .map((value) => ({ value, label: poStatusLabel(value), count: counts?.[value] ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
