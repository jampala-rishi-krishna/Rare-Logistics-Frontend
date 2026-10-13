/** Recipient chip parsing/validation for the Confirmed Orders email popup. */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Split free text on commas, semicolons, whitespace or newlines (Enter). */
export function splitRecipientInput(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

export type RecipientParse = { added: string[]; invalid: string[]; duplicates: string[] };

/** Parse typed/pasted text against the current chips: valid new emails, invalid tokens, duplicates. */
export function parseRecipients(text: string, existing: string[] = []): RecipientParse {
  const seen = new Set(existing.map((e) => e.toLowerCase()));
  const added: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  for (const token of splitRecipientInput(text)) {
    if (!isValidEmail(token)) {
      invalid.push(token);
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(token);
      continue;
    }
    seen.add(key);
    added.push(token);
  }
  return { added, invalid, duplicates };
}

export function removeRecipient(list: string[], email: string): string[] {
  return list.filter((e) => e !== email);
}

/** Send is allowed only with a warehouse and at least one recipient in To. */
export function canSendEmail(warehouse: string | null | undefined, to: string[]): boolean {
  return (warehouse === "mets" || warehouse === "glacier") && to.length > 0;
}
