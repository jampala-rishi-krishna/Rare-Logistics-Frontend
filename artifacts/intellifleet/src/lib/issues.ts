// Issue report form: client-side checks (the server validates again) and labels. Pure, unit tested.

export const ISSUE_PRIORITY_LABELS: Record<string, string> = { normal: "Normal", high: "High", urgent: "Urgent" };
export const MIN_DESCRIPTION = 5;
export const MAX_DESCRIPTION = 2000;

export function validateIssue(input: { category: string; priority: string; description: string }, categories: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.category || (categories.length > 0 && !categories.includes(input.category))) errors.category = "Choose a category.";
  if (!(input.priority in ISSUE_PRIORITY_LABELS)) errors.priority = "Choose a priority.";
  const text = input.description.trim();
  if (text.length < MIN_DESCRIPTION) errors.description = `Describe the issue (at least ${MIN_DESCRIPTION} characters).`;
  else if (text.length > MAX_DESCRIPTION) errors.description = `At most ${MAX_DESCRIPTION} characters.`;
  return errors;
}

const STATUS_TONE: Record<string, string> = {
  submitted: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
  acknowledged: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  in_progress: "border-[#0b57d0]/30 bg-[#eef3fd] text-[#0b57d0]",
  resolved: "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]",
  closed: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
};

export function issueStatusTone(status: string): string {
  return STATUS_TONE[status] ?? STATUS_TONE.submitted;
}
