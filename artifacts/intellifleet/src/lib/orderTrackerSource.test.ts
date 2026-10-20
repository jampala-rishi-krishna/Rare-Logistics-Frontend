// Order Tracker source hygiene: colours come only from index.css / themeTokens variables, never hex literals.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const src = fileURLToPath(new URL("..", import.meta.url));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const FILES = [
  join(src, "pages", "OrderTracker.tsx"),
  join(src, "pages", "orderTracker.css"),
  ...walk(join(src, "pages", "orderTracker")),
  join(src, "lib", "orderTrackerView.ts"),
];
// #rgb, #rgba, #rrggbb, #rrggbbaa not preceded by a word char or "&" (HTML entities) and not followed by a word char.
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

test("Order Tracker source files exist", () => {
  assert.ok(FILES.length >= 10, `expected the tracker files, found ${FILES.length}`);
  for (const f of FILES) assert.ok(statSync(f).isFile(), f);
});

test("no hex colour literals in Order Tracker source (tokens only)", () => {
  const found: string[] = [];
  for (const file of FILES) {
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(HEX)) found.push(`${file.slice(src.length)}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(found, []);
});

test("the hex detector catches literals and ignores ids / entities", () => {
  const hits = (s: string) => [...s.matchAll(HEX)].map(m => m[0]);
  assert.deepEqual(hits("color: #fff; background:#1E54B7; border: 1px solid #AFAFAF80"), ["#fff", "#1E54B7", "#AFAFAF80"]);
  assert.deepEqual(hits('href="#ota-question" &#8212; id="#add-row" #ot-date-pop'), []);
});
