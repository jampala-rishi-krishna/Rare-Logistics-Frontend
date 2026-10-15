// THE colour tokens of the IntelliFleet dashboard for code that styles inline (driver app, Driver Overview).
// Values live ONLY in src/index.css (:root CSS variables); this file maps roles to those variables so a theme change in
// index.css updates every screen. Never put hex literals in pages/driver/** or pages/overview/** - import from here.
const v = (name: string) => `hsl(var(--${name}))`;

export const T = {
  canvas: v("card"), // white page background (Uber-style)
  surface: v("muted"), // grouped areas, read-only fields, done rows
  ink: v("foreground"), // text, primary buttons, current step
  onInk: v("primary-foreground"), // text on ink (white)
  muted: v("muted-foreground"), // secondary text (the lightest allowed text colour)
  line: v("border"), // 1px dividers / card borders
  primary: v("primary"),
  positive: v("status-success"),
  positiveBg: v("success-bg"),
  warning: v("status-warning"),
  warningBg: v("warning-bg"),
  negative: v("destructive"),
  negativeBg: v("destructive-bg"),
  accent: v("info"), // "here / in progress" only
  accentBg: v("info-bg"),
  orderSO: v("order-so"),
  orderWM: v("order-wm"),
  orderPO: v("order-po"),
  orderTO: v("order-to"),
} as const;

export type ThemeToken = keyof typeof T;

/** Same colour with alpha, e.g. alpha("ink", 0.5) -> hsl(var(--foreground) / 0.5). */
export function alpha(token: ThemeToken, a: number): string {
  return T[token].replace(/\)\)$/, `) / ${a})`);
}

export const FONT_SANS = "var(--app-font-sans)";
