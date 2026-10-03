import type { MarkdownIt, Token } from "markdown-it";

const NBSP = " ";
const UNITS = "kg|g|mg|km|m|cm|mm|ms|s|min|h|MB|GB|KB|TB|px|pt|°C|°F";

// The problem is markdown-it's typographer gets the obvious cases (curly quotes, dashes, ellipses) but misses the details a typesetter would fix.
// The way we solve this is a set of small text rewrites: leading apostrophes, fractions, ×, and non-breaking spaces that keep units and titles attached.
// Understand: markdown-it either leaves '90s straight or opens a quote ‘90s; both become the apostrophe ’90s. Any straight ' that survives smart quotes is an apostrophe.
function refine(text: string): string {
  return text
    .replace(/‘(?=(\d\ds|em|tis|twas|cause|n)\b)/gi, "’")
    .replace(/'/g, "’")
    .replace(/(?<![\w/])1\/2(?![\w/])/g, "½")
    .replace(/(?<![\w/])1\/4(?![\w/])/g, "¼")
    .replace(/(?<![\w/])3\/4(?![\w/])/g, "¾")
    .replace(/\b(\d+)( ?)x\2(?=\d)/g, (all, n, sp) => (n === "0" && !sp ? all : `${n}${sp}×${sp}`))
    .replace(new RegExp(`(\\d) (?=(${UNITS})\\b)`, "g"), `$1${NBSP}`)
    .replace(/\b(Dr|Mr|Mrs|Ms|St|Prof|Fig|No|p|pp|vs)\. /g, `$1.${NBSP}`);
}

// The problem is a paragraph ending with a single word stranded on its own line looks sloppy in print.
// The way we solve this is to glue the last two words with a non-breaking space, unless the last word is long enough to stand alone.
function preventWidow(children: Token[]) {
  const lastIdx = children.findLastIndex((t) => t.type === "text" || t.type === "code_inline" || t.type === "image");
  const last = children[lastIdx];
  if (!last || last.type !== "text") return;
  const m = last.content.match(/ (\S{1,10})\s*$/);
  if (m && m.index !== undefined) last.content = last.content.slice(0, m.index) + NBSP + last.content.slice(m.index + 1);
}

// The problem is the user wants documents to read like they were typeset, not typed.
// The way we solve this is a markdown-it core rule that runs after smart quotes and touches only prose text, never code.
// flow: Preview tab — user switches to Preview -> renderMarkdown() -> typographyPlugin rule <-- HERE
export function typographyPlugin(md: MarkdownIt) {
  md.core.ruler.push("typography_extras", (state) => {
    if (!state.md.options.typographer) return;
    state.tokens.forEach((block, i) => {
      if (block.type !== "inline" || !block.children) return;
      for (const t of block.children) if (t.type === "text") t.content = refine(t.content);
      if (state.tokens[i - 1]?.type === "paragraph_open") preventWidow(block.children);
    });
  });
}
