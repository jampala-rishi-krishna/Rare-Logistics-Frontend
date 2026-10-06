import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "RichAssistantMessage.tsx"), "utf8");

test("mermaid is imported only through the lazy loader", () => {
  assert.equal(/import\s+mermaid\s+from\s+["']mermaid["']/.test(source), false);
  assert.match(source, /import\(["']mermaid["']\)/);
  assert.match(source, /function MermaidBlock/);
});

test("plain messages do not mount the mermaid block path", () => {
  assert.match(source, /part\.type === "mermaid"\)[^\n]+<MermaidBlock/);
});
