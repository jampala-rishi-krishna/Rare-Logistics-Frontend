// Design primitives for the driver app, taken 1:1 from docs/RGF Driver App – Simplified UI.html
// (#F2F2EE background, #0A0A0A primary, white cards, DM Sans, 24px stroke icons). Fluid width, safe-area aware.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { withDriverParams } from "@/lib/driver";
import { useT } from "./i18n";

export const C = {
  bg: "#F2F2EE",
  ink: "#0A0A0A",
  card: "#FFFFFF",
  sub: "#55554F",
  body: "#3A3A36",
  line: "#E4E4DF",
  field: "#D6D6CF",
  soft: "#F7F7F3",
  muted: "#EDEDE8",
  navOff: "#6B6B64",
  amberBg: "#FFF3C4",
  amber: "#6B4A00",
  greenBg: "#E3F2E7",
  green: "#1A5C2E",
  blueBg: "#E6EEFB",
  blue: "#1B4A8F",
  so: "#B42318",
  wm: "#7C3AED",
  po: "#1B4A8F",
  to: "#1D7A3A",
  scrim: "#5E5E59", // solid, as drawn in the Delivered sheet design
} as const;

export const FONT = "'DM Sans', system-ui, sans-serif";

// Bottom bars: the design's 22-26px bottom padding, or more on phones with a home indicator.
export const SAFE_BOTTOM = (px: number) => `max(${px}px, calc(env(safe-area-inset-bottom) + 12px))`;

// ---- icons (exact paths from the design; viewBox 24, stroke 2, round caps) ----
const PATHS: Record<string, ReactNode> = {
  truck: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M5 12l5 5 9-10" />,
  navigate: <path d="M3 11l18-8-8 18-2-8z" />,
  pin: (
    <>
      <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  info: (
    <>
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7z" />,
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  clipboardCheck: (
    <>
      <path d="M9 4h6v3H9z" />
      <path d="M9 5H6v16h12V5h-3" />
      <path d="M9 14l2 2 4-4" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M7 21v-8h10v8" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = C.ink, width = 2, style }: { name: IconName; size?: number; color?: string; width?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {PATHS[name]}
    </svg>
  );
}

// ---- page frames ----

// Full-height page on the design background. Children decide their own padding.
export function Page({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ minHeight: "100dvh", background: C.bg, fontFamily: FONT, color: C.ink, overflowX: "hidden" }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>{children}</div>
    </div>
  );
}

// A bar fixed to the bottom with a spacer of the same height in the flow, so it never covers content.
export function FixedBottom({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(96);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden="true" style={{ height: h, flexShrink: 0 }} />
      <div ref={ref} data-testid={testId} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: C.card, borderTop: `1px solid ${C.line}`, fontFamily: FONT }}>
        <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", ...style }}>{children}</div>
      </div>
    </>
  );
}

// Trip-screen action bar (design: padding 14px 20px 26px, gap 10px).
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <FixedBottom testId="driver-action-bar" style={{ padding: `14px 20px ${SAFE_BOTTOM(26)}`, display: "flex", flexDirection: "column", gap: 10, boxSizing: "border-box" }}>
      {children}
    </FixedBottom>
  );
}

export type Tab = "today" | "acknowledge" | "history" | "profile";

// Badge = orders still to acknowledge (on the Acknowledge tab).
export function BottomNav({ active, adminDriverId, badge = 0 }: { active: Tab; adminDriverId: string | null; badge?: number }) {
  const t = useT();
  const items: Array<{ tab: Tab; href: string; icon: IconName; label: string }> = [
    { tab: "today", href: "/driver/today", icon: "home", label: t.tabToday },
    { tab: "acknowledge", href: "/driver/acknowledge", icon: "clipboardCheck", label: t.tabAck },
    { tab: "history", href: "/driver/history", icon: "clock", label: t.tabHistory },
    { tab: "profile", href: "/driver/profile", icon: "user", label: t.tabProfile },
  ];
  return (
    <FixedBottom style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", padding: `8px 0 ${SAFE_BOTTOM(22)}`, boxSizing: "border-box" }}>
      {items.map((it) => {
        const on = it.tab === active;
        const color = on ? C.ink : C.navOff;
        return (
          <Link
            key={it.tab}
            href={withDriverParams(it.href, { driver_id: adminDriverId })}
            data-testid={`driver-nav-${it.tab}`}
            aria-current={on ? "page" : undefined}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13, fontWeight: on ? 700 : 400, color, textDecoration: "none", minHeight: 48, minWidth: 0 }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={it.icon} color={color} width={on ? 2.2 : 2} />
              {it.tab === "acknowledge" && badge > 0 && (
                <span data-testid="driver-ack-badge" style={{ position: "absolute", top: -4, right: -10, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.so, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span style={{ maxWidth: "100%", padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", boxSizing: "border-box" }}>{it.label}</span>
          </Link>
        );
      })}
    </FixedBottom>
  );
}

// ---- buttons ----
const primaryBase: CSSProperties = {
  height: 60,
  borderRadius: 16,
  background: C.ink,
  color: "#FFFFFF",
  border: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  fontSize: 18,
  fontWeight: 700,
  fontFamily: FONT,
  textDecoration: "none",
  width: "100%",
  padding: "0 16px",
  boxSizing: "border-box",
  cursor: "pointer",
};

export function PrimaryButton({ children, icon, onClick, disabled, testId, height = 60, fontSize = 18, type = "button" }: { children: ReactNode; icon?: IconName; onClick?: () => void; disabled?: boolean; testId?: string; height?: number; fontSize?: number; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} style={{ ...primaryBase, height, fontSize, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
      {icon && <Icon name={icon} size={22} color="#FFFFFF" width={icon === "check" ? 2.4 : 2} />}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </button>
  );
}

const outlineBase: CSSProperties = {
  ...primaryBase,
  background: "#FFFFFF",
  color: C.ink,
  border: `1.5px solid ${C.ink}`,
};

export function OutlineButton({ children, icon, onClick, href, external, disabled, testId, height = 60, fontSize = 18 }: { children: ReactNode; icon?: IconName; onClick?: () => void; href?: string; external?: boolean; disabled?: boolean; testId?: string; height?: number; fontSize?: number }) {
  const style: CSSProperties = { ...outlineBase, height, fontSize, gap: 8, opacity: disabled ? 0.45 : 1 };
  const inner = (
    <>
      {icon && <Icon name={icon} size={20} />}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </>
  );
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId} style={style}>
        {inner}
      </a>
    );
  if (href)
    return (
      <Link href={href} data-testid={testId} style={style}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} style={style}>
      {inner}
    </button>
  );
}

// Small grey text button (design: "Problem?", "Not fully delivered?").
export function TextButton({ children, onClick, testId, color = C.sub, disabled }: { children: ReactNode; onClick?: () => void; testId?: string; color?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} style={{ height: 44, border: 0, background: "transparent", fontFamily: FONT, fontSize: 15, fontWeight: 500, color, cursor: "pointer", width: "100%" }}>
      {children}
    </button>
  );
}

// Round icon button (back, call). 44px on cards, 48px for "Call dispatch".
export function RoundButton({ icon, label, href, onClick, size = 44, filled = false, testId, iconSize }: { icon: IconName; label: string; href?: string | null; onClick?: () => void; size?: number; filled?: boolean; testId?: string; iconSize?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size / 2,
    border: filled ? 0 : `1px solid ${C.field}`,
    background: filled ? C.bg : "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  };
  const inner = <Icon name={icon} size={iconSize ?? (icon === "back" ? 22 : size >= 48 ? 22 : 20)} />;
  if (href && /^tel:|^https?:/.test(href))
    return (
      <a href={href} aria-label={label} data-testid={testId} style={style}>
        {inner}
      </a>
    );
  if (href)
    return (
      <Link href={href} aria-label={label} data-testid={testId} style={style}>
        {inner}
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} data-testid={testId} style={style}>
      {inner}
    </button>
  );
}

// ---- chips & badges ----
export type ChipTone = "amber" | "green" | "blue" | "grey";
const TONES: Record<ChipTone, [string, string]> = {
  amber: [C.amberBg, C.amber],
  green: [C.greenBg, C.green],
  blue: [C.blueBg, C.blue],
  grey: [C.muted, C.body],
};

export function Chip({ tone, children, big = false, testId }: { tone: ChipTone; children: ReactNode; big?: boolean; testId?: string }) {
  const [bg, fg] = TONES[tone];
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", padding: big ? "6px 12px" : "5px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </span>
  );
}

export function TypeBadge({ type }: { type: string | null | undefined }) {
  const raw = String(type ?? "SO").toUpperCase();
  const kind = raw === "TO" || raw === "PO" || raw === "WM" ? raw : "SO";
  const color = { SO: C.so, WM: C.wm, PO: C.po, TO: C.to }[kind];
  return <span data-testid={`driver-type-badge-${kind}`} style={{ padding: "2px 7px", borderRadius: 6, border: `1.5px solid ${color}`, color, fontSize: 12, fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>{kind}</span>;
}

export function NumberDot({ n, active = true, size = 36, done = false }: { n: number; active?: boolean; size?: number; done?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: done ? C.greenBg : active ? C.ink : C.muted, color: done ? C.green : active ? "#FFFFFF" : C.body, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
      {done ? <Icon name="check" size={size * 0.55} color={C.green} width={2.4} /> : n}
    </div>
  );
}

// Amber banner (design: alert on Today). Optional dismiss X.
export function Banner({ children, tone = "amber", onDismiss, onClick, testId, dismissLabel = "Dismiss" }: { children: ReactNode; tone?: ChipTone; onDismiss?: () => void; onClick?: () => void; testId?: string; dismissLabel?: string }) {
  const [bg, fg] = TONES[tone];
  const body = (
    <>
      <Icon name="info" size={18} color={fg} />
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", textAlign: "left" }}>{children}</span>
    </>
  );
  return (
    <div role="status" data-testid={testId} style={{ padding: onDismiss ? "4px 4px 4px 14px" : "12px 14px", borderRadius: 14, background: bg, color: fg, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
      {onClick ? (
        <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, minHeight: 40, border: 0, background: "transparent", color: fg, font: "inherit", padding: onDismiss ? "8px 0" : 0, cursor: "pointer" }}>
          {body}
        </button>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, padding: onDismiss ? "8px 0" : 0 }}>{body}</span>
      )}
      {onDismiss && (
        <button type="button" aria-label={dismissLabel} onClick={onDismiss} style={{ width: 44, height: 44, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Icon name="x" size={18} color={fg} />
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  const initials = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: size / 2, background: C.ink, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size >= 60 ? 22 : 15, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export function Skeleton({ height, radius = 18 }: { height: number; radius?: number }) {
  return <div className="animate-pulse" style={{ height, borderRadius: radius, background: C.muted }} />;
}

// ---- bottom sheet (the Delivered sheet is the template for every sheet) ----
export function Sheet({
  open,
  onClose,
  children,
  context,
  testId,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  // White text shown on the dimmed area above the sheet (design: plate · stop, customer, Arrived chip).
  context?: ReactNode;
  testId?: string;
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" data-testid={testId} style={{ position: "fixed", inset: 0, zIndex: 60, background: C.scrim, fontFamily: FONT, color: C.ink, display: "flex", flexDirection: "column" }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div onClick={() => !busy && onClose()} style={{ flex: 1, minHeight: 24, paddingTop: "env(safe-area-inset-top)", color: "#FFFFFF" }}>
          {context && <div style={{ padding: "24px 20px" }}>{context}</div>}
        </div>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "26px 26px 0 0",
            padding: `12px 20px ${SAFE_BOTTOM(26)}`,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            maxHeight: "88dvh",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: 44, height: 5, borderRadius: 3, background: C.field, alignSelf: "center", flexShrink: 0 }} />
          {children}
        </div>
      </div>
    </div>
  );
}

export function SheetTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>{children}</div>
      {sub && <div style={{ fontSize: 15, color: C.sub, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Pill choice button (reason chips, history range, language toggle).
export function Pill({ on, children, onClick, testId, height = 44 }: { on: boolean; children: ReactNode; onClick: () => void; testId?: string; height?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      style={{ minHeight: height, padding: "6px 16px", borderRadius: height / 2, border: on ? `1px solid ${C.ink}` : `1px solid ${C.field}`, background: on ? C.ink : "#FFFFFF", color: on ? "#FFFFFF" : C.ink, fontFamily: FONT, fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer", textAlign: "center", lineHeight: 1.25 }}
    >
      {children}
    </button>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" style={{ fontSize: 14, fontWeight: 700, color: C.so }}>
      {children}
    </div>
  );
}

// Card used for lists (white, 18px radius).
export function Card({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div data-testid={testId} style={{ background: C.card, borderRadius: 18, padding: 16, ...style }}>
      {children}
    </div>
  );
}

// Moves to a path (keeps admin ?driver_id=).
export function useGo(adminDriverId: string | null) {
  const [, setLocation] = useLocation();
  return (path: string, extra: Record<string, string | null> = {}) => setLocation(withDriverParams(path, { ...extra, driver_id: adminDriverId }));
}
