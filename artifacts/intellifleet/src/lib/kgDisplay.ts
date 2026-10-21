// One way to write a kg figure. A total that includes lines with an unknown weight is a LOWER BOUND, never the real total:
// it is written "354 kg+" with a small note "1 line without weight". If nothing is known: a dash.
// Mirrors backend/services/weight_display.py.

export const DASH = "\u2014";

export function unknownLinesNote(unknownLines: number): string | null {
  if (!Number.isFinite(unknownLines) || unknownLines <= 0) return null;
  return unknownLines === 1 ? "1 line without weight" : `${unknownLines} lines without weight`;
}

export function formatKgPartial(kg: number | null | undefined, unknownLines = 0, digits = 1): { text: string; note: string | null } {
  const note = unknownLinesNote(unknownLines);
  if (kg === null || kg === undefined || !Number.isFinite(kg) || (note !== null && kg <= 0)) return { text: DASH, note };
  const text = kg.toLocaleString("en-US", { maximumFractionDigits: digits });
  return note === null ? { text: `${text} kg`, note: null } : { text: `${text} kg+`, note };
}

/** A kg number rounded to at most 2 decimals (49.41999999999999 -> 49.42). Non-finite -> null. */
export function roundKg(kg: number | null | undefined, digits = 2): number | null {
  if (kg === null || kg === undefined || !Number.isFinite(Number(kg))) return null;
  const f = 10 ** digits;
  return Math.round((Number(kg) + Number.EPSILON) * f) / f;
}

/** THE kg formatter: at most 2 decimals, thousands separators, " kg" suffix (unit: false omits it). Unknown -> dash. */
export function formatKg(kg: number | null | undefined, opts: { digits?: number; unit?: boolean } = {}): string {
  const r = roundKg(kg, opts.digits ?? 2);
  if (r === null) return DASH;
  const text = r.toLocaleString("en-US", { maximumFractionDigits: opts.digits ?? 2 });
  return opts.unit === false ? text : `${text} kg`;
}
