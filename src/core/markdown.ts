import MarkdownIt from "markdown-it";
import attrs from "markdown-it-attrs";
import type { MarkdownIt as Md, StateBlock } from "markdown-it";
import { typographyPlugin } from "./typography.ts";

const PAGEBREAK_LINE = /^(\\pagebreak|\\newpage|<!--\s*pagebreak\s*-->)\s*$/;

// The problem is the user needs to force a new page at a specific spot, e.g. before an appendix.
// The way we solve this is a block rule that turns a line of `\pagebreak`, `\newpage` or `<!-- pagebreak -->` into a break element.
// flow: Preview tab — user switches to Preview -> renderMarkdown() -> pagebreak rule <-- HERE
function pagebreakPlugin(md: Md) {
  md.block.ruler.before(
    "html_block",
    "pagebreak",
    (state: StateBlock, startLine: number, _endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const line = state.src.slice(start, state.eMarks[startLine]);
      if (state.sCount[startLine] - state.blkIndent >= 4 || !PAGEBREAK_LINE.test(line)) return false;
      if (silent) return true;
      const token = state.push("html_block", "", 0);
      token.content = '<div class="pagebreak"></div>\n';
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    },
    { alt: ["paragraph"] },
  );
}

// The problem is `![](./img.png)` in the markdown means "next to the .md file", but the preview page lives at a different URL.
// The way we solve this is to rewrite relative image paths to /files/<doc folder>/..., which the local server reads from disk.
// flow: Preview tab — user switches to Preview -> renderMarkdown() -> resolveImagesPlugin <-- HERE
function resolveImagesPlugin(md: Md, docDir: string) {
  const isExternal = (src: string) => /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(src);
  md.core.ruler.push("resolve_images", (state) => {
    for (const block of state.tokens) {
      for (const t of block.children ?? []) {
        if (t.type !== "image") continue;
        const src = String(t.attrGet("src") ?? "");
        if (src && !isExternal(src)) t.attrSet("src", "/files/" + new URL(src, `http://x/${docDir}`).pathname.slice(1));
      }
    }
  });
}

// The problem is turning the user's markdown into print-ready HTML with smart typography, page breaks and working images.
// The way we solve this is markdown-it with typographer on, plus our pagebreak, image-path and typography plugins.
// flow: Preview tab — user switches to Preview -> renderDoc() -> renderMarkdown() <-- HERE
export function renderMarkdown(body: string, opts: { docPath: string | null; typography: boolean }): string {
  const docDir = opts.docPath?.includes("/") ? opts.docPath.slice(0, opts.docPath.lastIndexOf("/") + 1) : "";
  const md = new MarkdownIt({ html: true, linkify: true, typographer: opts.typography })
    .use(attrs)
    .use(pagebreakPlugin)
    .use(typographyPlugin)
    .use(resolveImagesPlugin, docDir);
  return md.render(body);
}
