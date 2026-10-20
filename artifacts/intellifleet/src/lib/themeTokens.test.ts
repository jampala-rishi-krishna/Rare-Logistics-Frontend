import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { T, alpha } from "./themeTokens.ts";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const values = new Map([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

function rgb(token: string): number[] {
  const key = /var\(--([\w-]+)\)/.exec(token)?.[1];
  assert.ok(key, `Expected a CSS-variable token: ${token}`);
  const value = values.get(key);
  assert.ok(value && /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/.test(value), `${key} must resolve to HSL channels, not an overwritten hex variable`);
  const [h, s, l] = value.match(/[\d.]+/g)!.map(Number);
  const sat = s / 100, light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}
function luminance(color: number[]): number {
  const c = color.map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

test("shared theme resolves to valid CSS colors without legacy variable collisions", () => {
  for (const token of Object.values(T)) rgb(token);
  assert.equal(alpha("ink", 0.55), "hsl(var(--foreground) / 0.55)");
});

test("shared small-text status and surface combinations meet WCAG 4.5:1", () => {
  for (const [fg, bg] of [["ink", "canvas"], ["muted", "canvas"], ["muted", "surface"], ["onInk", "ink"], ["positive", "positiveBg"], ["warning", "warningBg"], ["negative", "negativeBg"], ["accent", "accentBg"], ["onAccent", "accent"], ["ink", "warningSolid"], ["onInkMuted", "ink"], ["onInk", "inkRaised"], ["orderSO", "canvas"], ["orderTO", "canvas"], ["orderPO", "canvas"], ["orderWM", "canvas"]] as const) {
    const [lighter, darker] = [luminance(rgb(T[fg])), luminance(rgb(T[bg]))].sort((a, b) => b - a);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
  }
});
