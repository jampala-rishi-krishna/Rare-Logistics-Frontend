// TEST HELPER (node only, used by tripI18n.test.ts): finds user-visible text written straight into the driver app's JSX
// instead of going through pages/driver/i18n.ts. Uses the TypeScript parser, so generics / comparisons are never mistaken
// for markup. Reported: JSX text with a letter, string literals rendered as JSX children (also inside ?: / ||), and string
// values of the attributes a person reads or hears (aria-label, placeholder, title, alt, label).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const READ_ATTRS = new Set(["aria-label", "placeholder", "title", "alt", "label"]);
const LETTER = /[A-Za-z]/;

export interface HardcodedText {
  file: string;
  line: number;
  text: string;
}

function isRenderedExpression(node: ts.Node): boolean {
  // Walk up through ?:, ||, &&, ( ) to the JsxExpression; it must be a child of an element (not an attribute value).
  let n: ts.Node = node;
  for (;;) {
    const p = n.parent;
    if (!p) return false;
    if (ts.isParenthesizedExpression(p)) n = p;
    else if (ts.isConditionalExpression(p) && p.condition !== n) n = p;
    else if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      const fallback = op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken;
      if (!(fallback || (op === ts.SyntaxKind.AmpersandAmpersandToken && p.right === n))) return false;
      n = p;
    } else break;
  }
  if (!n.parent || !ts.isJsxExpression(n.parent)) return false;
  const holder = n.parent.parent;
  return Boolean(holder) && (ts.isJsxElement(holder) || ts.isJsxFragment(holder));
}

export function scanSource(file: string, source: string): HardcodedText[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: HardcodedText[] = [];
  const add = (node: ts.Node, text: string) => out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: text.trim() });
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && LETTER.test(node.text)) add(node, node.text);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && LETTER.test(node.text) && isRenderedExpression(node)) add(node, node.text);
    else if (ts.isJsxAttribute(node) && READ_ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) && LETTER.test(init.text)) add(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression) {
        const walk = (e: ts.Node) => {
          if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && LETTER.test(e.text)) add(e, e.text);
          else if (ts.isConditionalExpression(e)) [e.whenTrue, e.whenFalse].forEach(walk);
          else if (ts.isBinaryExpression(e)) [e.left, e.right].forEach(walk);
          else if (ts.isParenthesizedExpression(e)) walk(e.expression);
        };
        walk(init.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanDir(dir: string): HardcodedText[] {
  const out: HardcodedText[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...scanDir(p));
    else if (name.endsWith(".tsx")) out.push(...scanSource(p, readFileSync(p, "utf8")));
  }
  return out;
}

// Hex colour literals (#abc, #aabbcc, #aabbccdd) anywhere in a file's code (comments ignored).
export function hexLiterals(file: string, source: string): HardcodedText[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: HardcodedText[] = [];
  const re = /#[0-9a-fA-F]{3,8}\b/;
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && re.test(node.text)) {
      out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.text.match(re)?.[0] ?? "" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function hexInDir(dir: string): HardcodedText[] {
  const out: HardcodedText[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...hexInDir(p));
    else if (/\.tsx?$/.test(name)) out.push(...hexLiterals(p, readFileSync(p, "utf8")));
  }
  return out;
}
