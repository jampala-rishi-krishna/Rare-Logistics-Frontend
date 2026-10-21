import { manilaHm } from "./statusColors.ts";

// What the assignment email status means for the UI. Assigning sends nothing: a fresh assignment is "not_sent" until the
// dispatcher presses Send; only then does it become queued -> sent / failed / skipped (what Gmail really did).

export type EmailStatusKey = "not_sent" | "queued" | "sent" | "failed" | "skipped";

export interface EmailStatusView {
  tone: EmailStatusKey;
  label: string;
  spinner: boolean;
  /** The first Send of a fresh assignment (email + WhatsApp/SMS/voice) is still to be done. */
  canSend: boolean;
  /** A failed email can be retried (email only). */
  canRetry: boolean;
}

const LABELS: Record<EmailStatusKey, string> = {
  not_sent: "Not sent",
  queued: "Email sending…",
  sent: "Email sent",
  failed: "Email failed",
  skipped: "Email skipped",
};

export function emailStatusView(status: string | null | undefined): EmailStatusView | null {
  if (!status) return null;
  const known = status in LABELS;
  const tone = (known ? status : "queued") as EmailStatusKey;
  return {
    tone,
    label: known ? LABELS[tone] : status,
    spinner: tone === "queued",
    canSend: tone === "not_sent",
    canRetry: tone === "failed",
  };
}

/** The heading of the status panel shown under the assignment form. */
export function panelHeading(status: string | null | undefined): string {
  if (status === "not_sent") return "Assignment saved - email not sent yet";
  if (status === "sent") return "Email sent";
  if (status === "failed") return "Email failed";
  if (status === "skipped") return "Email skipped";
  return "Sending assignment email…";
}

/**
 * Options for the send call. The first Send of a fresh assignment must NOT be a "resend": a resend is email-only and
 * never notifies by WhatsApp/SMS/voice, whereas the first Send does everything. Anything after the first send
 * (editing and sending again) is a resend.
 */
export function sendOptions(firstSend: boolean): { resend: boolean } {
  return { resend: !firstSend };
}

/** Polling continues only while Gmail has not answered; "not_sent" waits for a person, so it does not poll. */
export function shouldPollStatus(status: string | null | undefined): boolean {
  return !status || status === "queued";
}

/** Tooltip for the Crew email column and its Send button. */
export const CREW_EMAIL_TOOLTIP = "Sends the assignment email to the driver and helper";

/** "Crew email: Not sent" / "Crew email: Sent 10:12" (Manila time) / "Crew email: Sending…" / "Crew email: Failed". */
export function crewEmailLabel(status: string | null | undefined, sentAt?: string | null): string {
  if (!status || status === "not_sent") return "Crew email: Not sent";
  if (status === "sent") {
    const hm = manilaHm(sentAt);
    return hm ? `Crew email: Sent ${hm}` : "Crew email: Sent";
  }
  if (status === "failed") return "Crew email: Failed";
  if (status === "skipped") return "Crew email: Skipped";
  return "Crew email: Sending…";
}
