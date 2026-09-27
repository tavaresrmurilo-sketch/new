// Static "zero dead button" audit: every <button> in the renderer must be wired
// (onClick / onKeyDown handler or type="submit" inside a form) and have an accessible name.
// The E2E suite runs the same audit at runtime against the live UI.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "src");
const problems = [];
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) scan(p);
  }
}

function openingTag(src, start) {
  // walk forward to the matching '>' of the JSX opening tag, skipping {...} expressions
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

function scan(file) {
  const src = fs.readFileSync(file, "utf8");
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(src))) {
    count++;
    const tag = openingTag(src, m.index);
    const line = src.slice(0, m.index).split("\n").length;
    const where = `${path.relative(root, file)}:${line}`;
    const wired = /\bonClick=/.test(tag) || /type="submit"/.test(tag) || /\bonKeyDown=/.test(tag);
    if (!wired) problems.push(`${where} button without handler`);
    const afterTag = src.slice(m.index + tag.length, m.index + tag.length + 400);
    const hasText = !/^\s*<(Icon\w+)[^>]*\/>\s*<\/button>/.test(afterTag);
    const named = /aria-label=/.test(tag) || hasText;
    if (!named) problems.push(`${where} icon-only button without aria-label`);
  }
}

walk(root);
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) in ${count} buttons:\n` + problems.join("\n"));
  process.exit(1);
}
console.log(`✓ ${count} buttons audited: all wired and named.`);
