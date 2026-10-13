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
