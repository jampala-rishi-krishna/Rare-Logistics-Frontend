// TEST-ONLY: WCAG 2.1 text-contrast check run inside the page (axe-core is not installed; this is the equivalent for colour contrast).
// Every visible element with its own text: foreground vs the first opaque background up the tree. Normal text needs 4.5:1,
// large text (>= 24px, or >= 18.66px bold) 3:1. Disabled controls are exempt (WCAG 1.4.3).
import type { Page } from "playwright";

export interface ContrastViolation {
  text: string;
  ratio: number;
  required: number;
  fg: string;
  bg: string;
}

export async function contrastViolations(page: Page, root = "body"): Promise<ContrastViolation[]> {
  return page.evaluate((rootSel) => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const blend = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const bgOf = (el: Element | null): number[] => {
      const stack: number[][] = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] >= 1) break;
        }
      }
      let out = [255, 255, 255, 1];
      for (const c of stack.reverse()) out = blend(c, out);
      return out;
    };
    const out: { text: string; ratio: number; required: number; fg: string; bg: string }[] = [];
    const rootEl = document.querySelector(rootSel) ?? document.body;
    for (const el of Array.from(rootEl.querySelectorAll<HTMLElement>("*"))) {
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? "").trim()).join(" ").trim();
      if (!own) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if ((el as HTMLButtonElement).disabled || el.closest("[disabled],[aria-disabled=true]")) continue;
      const fgRaw = parse(s.color);
      if (!fgRaw) continue;
      const bg = bgOf(el);
      const fg = fgRaw[3] < 1 ? blend(fgRaw, bg) : fgRaw;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (ratio + 0.01 < required) out.push({ text: own.slice(0, 40), ratio: Math.round(ratio * 100) / 100, required, fg: s.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})` });
    }
    return out;
  }, root);
}
