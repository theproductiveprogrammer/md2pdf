import type { DocSettings, Slots } from "./config.ts";
import { fontStack, googleFontsUrl } from "./fonts.ts";

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The problem is the user writes header/footer text like "Page {page} of {pages}", but print CSS needs counters and quoted strings.
// The way we solve this is to substitute document fields directly and turn {page}/{pages} into CSS counter() calls.
function slotContent(template: string, settings: DocSettings): string {
  const parts: string[] = [];
  for (const piece of template.split(/(\{page\}|\{pages\})/)) {
    if (piece === "{page}") parts.push("counter(page)");
    else if (piece === "{pages}") parts.push("counter(pages)");
    else if (piece) {
      const filled = piece.replace(/\{(title|author|date)\}/g, (_, k: "title" | "author" | "date") => settings[k]);
      parts.push(cssString(filled));
    }
  }
  return parts.join(" ") || "none";
}

// The problem is headers and footers must repeat on every printed page, optionally skipping the cover page.
// The way we solve this is CSS @page margin boxes (top-left/center/right, bottom-…), which Paged.js lays out per page.
function marginBoxes(position: "top" | "bottom", slots: Slots | false, settings: DocSettings): { all: string; first: string } {
  if (!slots) return { all: "", first: "" };
  const all: string[] = [];
  const first: string[] = [];
  for (const side of ["left", "center", "right"] as const) {
    const text = slots[side];
    if (!text) continue;
    all.push(`@${position}-${side} { content: ${slotContent(text, settings)}; }`);
    if (slots.skipFirst) first.push(`@${position}-${side} { content: none; }`);
  }
  return { all: all.join("\n    "), first: first.join("\n    ") };
}

// The problem is the preview iframe needs a complete, self-contained page: content, theme, page geometry, fonts and the paginator.
// The way we solve this is to assemble one HTML string whose inline script waits for fonts and images, paginates, and reports the page count.
// Understand: the output must be deterministic for the same inputs — the preview pool uses it as its cache key. Accent colour is
// deliberately left out (applied live by the app) so recolouring never forces a re-pagination.
// flow: Preview tab — renderDoc() -> composeFor(theme) -> compose() <-- HERE
export function compose(opts: { bodyHtml: string; settings: DocSettings; themeCss: string }): string {
  const { settings, bodyHtml, themeCss } = opts;
  const header = marginBoxes("top", settings.header, settings);
  const footer = marginBoxes("bottom", settings.footer, settings);
  const fonts = [...new Set([settings.fonts.body, settings.fonts.heading, settings.fonts.mono])]
    .map(googleFontsUrl)
    .filter((url): url is string => !!url)
    .map((url) => `<link rel="stylesheet" href="${url}" data-pagedjs-ignore>`)
    .join("\n");

  const pageCss = `
  :root {
    --font-body: ${fontStack(settings.fonts.body, "serif")};
    --font-heading: ${fontStack(settings.fonts.heading, "sans")};
    --font-mono: ${fontStack(settings.fonts.mono, "mono")};
  }
  @page {
    size: ${settings.page.size};
    margin: ${settings.page.margin};
    ${header.all}
    ${footer.all}
  }
  @page :first {
    ${header.first}
    ${footer.first}
  }
  ${settings.breakBeforeH1 ? "h1:not(:first-child) { break-before: page; }" : ""}`;

  return `<!doctype html>
<html lang="${escapeHtml(settings.lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(settings.title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>${themeCss}</style>
<style>${pageCss}</style>
<style media="screen">
  html, body { margin: 0; background: transparent; }
  .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 32px 0 64px; }
  .pagedjs_page { background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .08), 0 8px 24px rgb(0 0 0 / .12); }
</style>
<script>
  window.PagedConfig = {
    auto: true,
    before: async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
    },
    after: (flow) => parent.postMessage({ type: "md2pdf:rendered", pages: flow.total }, "*"),
  };
  window.addEventListener("error", (e) => parent.postMessage({ type: "md2pdf:error", message: String(e.message) }, "*"));
</script>
<script src="/vendor/paged.polyfill.js"></script>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
