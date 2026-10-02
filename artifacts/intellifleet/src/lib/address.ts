/** Zoho shipping/billing addresses are split across several fields. The street often lives in
 * `street2` while `address` holds only a name or first line (e.g. address: "JESS FINE FOOD INC",
 * street2: "220 Pilar St., Brgy. Addition Hills Mandaluyong City"), so every part must be
 * read - dropping one silently truncates the address. */
export function addressLines(value: unknown): string[] {
  let record: unknown = value;
  if (typeof record === "string") {
    const text = record.trim();
    try {
      record = JSON.parse(text);
    } catch {
      return text ? [text] : [];
    }
  }
  const item = (Array.isArray(record) ? record[0] : record) as Record<string, unknown> | null | undefined;
  if (!item || typeof item !== "object") return [];
  const part = (key: string) => {
    const v = item[key];
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const locality = [part("city"), part("state"), part("zip")].filter(Boolean).join(", ");
  const seen = new Set<string>();
  return [part("company_name"), part("attention"), part("address"), part("street_address"), part("street2"), locality, part("country")]
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Full address, one part per line (render with `whitespace-pre-line`). "" when there is none. */
export function formatAddress(value: unknown): string {
  return addressLines(value).join("\n");
}
