import type { Colors, DocSettings, Slots } from "./config.ts";
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
// Understand: the output must be deterministic for the same inputs — the preview pool uses it as its cache key. The theme's own
// colours are baked in so the page stands alone; the user's colour overrides are left out (applied live by the app) so
// recolouring never forces a re-pagination.
// flow: Preview tab — renderDoc() -> composeFor(theme) -> compose() <-- HERE
export function compose(opts: { bodyHtml: string; settings: DocSettings; themeCss: string; themeColors: Colors }): string {
  const { settings, bodyHtml, themeCss, themeColors } = opts;
  const header = marginBoxes("top", settings.header, settings);
  const footer = marginBoxes("bottom", settings.footer, settings);
  const fonts = [...new Set([settings.fonts.body, settings.fonts.heading, settings.fonts.mono])]
    .map((name) => googleFontsUrl(name))
    .filter((url): url is string => !!url)
    .map((url) => `<link rel="stylesheet" href="${url}" data-pagedjs-ignore>`)
    .join("\n");

  const pageCss = `
  :root {
    --font-body: ${fontStack(settings.fonts.body, "serif")};
    --font-heading: ${fontStack(settings.fonts.heading, "sans")};
    --font-mono: ${fontStack(settings.fonts.mono, "mono")};
    --text: ${themeColors.text};
    --muted: ${themeColors.muted};
    --quote: ${themeColors.quote};
    --accent: ${themeColors.accent};
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
<script>
  // Split tables: (1) size columns once from the WHOLE table and pin those widths on every fragment, so
  // columns line up across pages and no cell is sized for only the rows that happened to land on page 1;
  // (2) repeat the header row on each continuation page. Both run during layout, so their height counts
  // when Paged.js decides how many rows fit. Refs are stripped from copies so Paged.js never mistakes them
  // for the originals.
  const stripRefs = (el) => { for (const e of [el, ...el.querySelectorAll("[data-ref]")]) e.removeAttribute("data-ref"); return el; };

  // Column widths: each column gets its min-content (longest word), then the spare width is shared in
  // proportion to how much more each column wants (max-content - min-content). Long prose columns get the
  // room; short code/number columns stay tight. Measured on a hidden copy of the whole table.
  function columnGroup(sourceTable, host) {
    const available = host.getBoundingClientRect().width;
    const measure = (width) => {
      const probe = stripRefs(sourceTable.cloneNode(true));
      probe.style.cssText = "position:absolute; visibility:hidden; left:0; top:0; table-layout:auto; width:" + width;
      host.parentNode.appendChild(probe);
      const widths = [...(probe.querySelector("tr")?.children ?? [])].map((c) => c.getBoundingClientRect().width);
      probe.remove();
      return widths;
    };
    const min = measure("min-content");
    const max = measure("max-content");
    const minTotal = min.reduce((a, b) => a + b, 0);
    const maxTotal = max.reduce((a, b) => a + b, 0);
    const want = max.map((m, i) => Math.max(0, m - min[i]));
    const wantTotal = want.reduce((a, b) => a + b, 0) || 1;
    const widths = maxTotal <= available
      ? max.map((m) => m + (available - maxTotal) / max.length)
      : min.map((m, i) => m + Math.max(0, available - minTotal) * (want[i] / wantTotal));
    const sum = widths.reduce((a, b) => a + b, 0) || 1;
    const group = document.createElement("colgroup");
    for (const w of widths) {
      const col = document.createElement("col");
      col.style.width = (w / sum) * 100 + "%";
      group.appendChild(col);
    }
    return group;
  }

  Paged.registerHandlers(class extends Paged.Handler {
    renderNode(clone, node) {
      if (clone.nodeType !== 1) return;

      if (clone.tagName === "TABLE" && !clone.hasAttribute("data-split-from")) {
        clone.style.tableLayout = "fixed";
        clone.insertBefore(columnGroup(node, clone), clone.firstChild);
        return;
      }

      if (clone.tagName !== "TR" || node.parentElement?.tagName === "THEAD") return;
      const table = clone.closest("table");
      if (!table?.hasAttribute("data-split-from") || table.querySelector(":scope > thead")) return;
      const first = document.querySelector('table[data-ref="' + table.dataset.splitFrom + '"]:not([data-split-from])');
      const group = first?.querySelector(":scope > colgroup");
      if (group) {
        table.style.tableLayout = "fixed";
        table.insertBefore(group.cloneNode(true), table.firstChild);
      }
      const sourceHead = node.closest("table")?.querySelector(":scope > thead");
      if (sourceHead) table.insertBefore(stripRefs(sourceHead.cloneNode(true)), group ? table.children[1] : table.firstChild);
    }
  });
</script>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
