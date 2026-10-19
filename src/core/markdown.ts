import MarkdownIt from "markdown-it";
import attrs from "markdown-it-attrs";
import { katex } from "@mdit/plugin-katex";
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

const docDirOf = (docPath: string | null) => (docPath?.includes("/") ? docPath.slice(0, docPath.lastIndexOf("/") + 1) : "");

// The problem is `./img.png` in a document means "next to the .md file", but the preview page lives at a different URL.
// The way we solve this is to rewrite relative paths to /files/<doc folder>/..., which the local server reads from disk;
// URLs, data URIs and absolute paths pass through untouched.
export function assetUrl(src: string, docPath: string | null): string {
  if (!src || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(src)) return src;
  return "/files/" + new URL(src, `http://x/${docDirOf(docPath)}`).pathname.slice(1);
}

// flow: Preview tab — user switches to Preview -> renderMarkdown() -> resolveImagesPlugin <-- HERE
function resolveImagesPlugin(md: Md, docPath: string | null) {
  md.core.ruler.push("resolve_images", (state) => {
    for (const block of state.tokens) {
      for (const t of block.children ?? []) {
        if (t.type === "image") t.attrSet("src", assetUrl(String(t.attrGet("src") ?? ""), docPath));
      }
    }
  });
}

// The problem is a standalone image with a caption should print as a proper figure that never splits from its caption.
// The way we solve this is to turn a paragraph holding only an image into <figure>, with the image title rendered as <figcaption>.
// flow: Preview tab — user switches to Preview -> renderMarkdown() -> figurePlugin <-- HERE
function figurePlugin(md: Md) {
  md.core.ruler.push("figure", (state) => {
    const tokens = state.tokens;
    for (let i = 1; i < tokens.length - 1; i++) {
      const inline = tokens[i];
      if (inline.type !== "inline" || tokens[i - 1].type !== "paragraph_open" || tokens[i + 1].type !== "paragraph_close") continue;
      const parts = (inline.children ?? []).filter((c) => c.type !== "softbreak" && !(c.type === "text" && !c.content.trim()));
      if (parts.length !== 1 || parts[0].type !== "image") continue;

      const img = parts[0];
      tokens[i - 1].tag = tokens[i + 1].tag = "figure";
      inline.children = [img];
      const caption = img.attrGet("title");
      if (caption) {
        img.attrs = (img.attrs ?? []).filter(([k]) => k !== "title");
        const cap = new state.Token("html_inline", "", 0);
        cap.content = `<figcaption>${md.renderInline(String(caption))}</figcaption>`;
        inline.children.push(cap);
      }
    }
  });
}

// The problem is themes want to style the paragraph right after the title (drop cap, subtitle, contact line).
// The way we solve this is to tag it with class "lead", because Paged.js drops `h1 + p::first-letter`-style rules.
// Understand: Paged.js rewrites every `A + B` selector into a data attribute, which loses pseudo-elements.
function leadParagraphPlugin(md: Md) {
  md.core.ruler.push("lead_paragraph", (state) => {
    state.tokens.forEach((t, i) => {
      const prev = state.tokens[i - 1];
      if (t.type === "paragraph_open" && prev?.type === "heading_close" && prev.tag === "h1") t.attrJoin("class", "lead");
    });
  });
}

const KEEP_TOGETHER_MAX_ROWS = 8;

// The problem is a long table that won't fit in the space left on a page jumps whole to the next page, leaving a near-empty page behind.
// The way we solve this is to let tables split between rows by default, and only mark short tables (≤ 8 rows) to stay in one piece.
// flow: Preview tab — user switches to Preview -> renderMarkdown() -> tableKeepPlugin <-- HERE
function tableKeepPlugin(md: Md) {
  md.core.ruler.push("table_keep", (state) => {
    let open: (typeof state.tokens)[number] | null = null;
    let rows = 0;
    for (const t of state.tokens) {
      if (t.type === "table_open") (open = t), (rows = 0);
      else if (t.type === "tr_open") rows++;
      else if (t.type === "table_close" && open) {
        if (rows - 1 <= KEEP_TOGETHER_MAX_ROWS) open.attrJoin("class", "keep-together");
        open = null;
      }
    }
  });
}

// The problem is turning the user's markdown into print-ready HTML with smart typography, page breaks and working images.
// The way we solve this is markdown-it with KaTeX, typographer, pagebreak, typography, figure and image-path plugins.
// flow: Preview tab — user switches to Preview -> renderDoc() -> renderMarkdown() <-- HERE
export function renderMarkdown(body: string, opts: { docPath: string | null; typography: boolean }): string {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: opts.typography })
    .use(katex, { throwOnError: false })
    .use(attrs)
    .use(pagebreakPlugin)
    .use(typographyPlugin)
    .use(figurePlugin)
    .use(leadParagraphPlugin)
    .use(tableKeepPlugin)
    .use(resolveImagesPlugin, opts.docPath);
  return md.render(body);
}
