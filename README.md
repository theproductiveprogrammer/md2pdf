# md2pdf

Turn Markdown into well-typeset, properly paginated PDFs. You write in a browser editor, see the real pages as they will print, try themes, fonts and colours instantly, and export with your browser's "Save as PDF".

It runs locally. A small Node server gives the browser access to images on your disk, and the browser does all the rendering. Nothing is uploaded anywhere.

## Quick start

```sh
npm install
npm link                     # optional: installs the `md2pdf` command

md2pdf path/to/report.md     # edit a file; ⌘S saves it back
md2pdf path/to/folder        # scratch pad; images resolve relative to that folder
md2pdf                       # scratch pad; images resolve relative to the current folder
```

Without `npm link`, use `npm run dev -- [path]`. The app opens at http://localhost:4848; if that port is taken it tries the next one. Pass `--no-open` to skip opening the browser.

Requires Node 23.6 or newer, which runs the TypeScript server directly. Export works best in Chrome or another Chromium browser.

## Using it

The app has two tabs. **⌘↵** switches between them.

**Write** is a Markdown editor with a **Document** form above it. The form has:
- title, author and date
- header and footer, each with a show/hide checkbox, left/center/right text and "Skip first page"
- options: **Chapter breaks** (each `# H1` starts a new page) and **Smart typography**

The form and the YAML front matter at the top of the file stay in sync both ways: typing in the form edits the YAML, and editing the YAML updates the form. Grey placeholder text shows what the theme prints by default.

**Preview** shows the actual paginated pages, with a toolbar for:

- **Theme**: click a theme to apply it, hover to preview it, or use `[` and `]` to cycle through them.
- **Size and margins**: A4, Letter, A5, Legal, and landscape A4/Letter. Margins are Narrow, Normal, Wide or the theme default.
- **Typeface**: each font is drawn in its own face. Filter by Sans, Serif or Mono, and apply it to body and headings together, either one alone, or code.
- **Colours**: ten palettes, or set each of the four palette colours yourself.

Every toolbar choice is written into the front matter, so the document carries its own look. **Export PDF** opens the print dialog. Choose **Save as PDF** to save exactly what the preview shows.

The preview re-renders in the background shortly after you stop typing, and the other themes are rendered while the browser is idle. Switching themes is therefore instant, and colour changes apply without re-laying out the pages.

| Shortcut | Action |
|---|---|
| ⌘↵ | Switch between Write and Preview |
| ⌘S | Save to the file (when launched on a `.md` file) |
| `[` / `]` | Previous / next theme (Preview tab) |
| Esc | Close an open picker |

## Writing

### Page breaks

Put any of these on its own line:

```md
\pagebreak
\newpage
<!-- pagebreak -->
```

Set `breakBeforeH1: true` to start every top-level heading on a new page.

The layout also keeps related content together:
- Headings stay with the content that follows them.
- Code blocks, figures and short tables (8 rows or fewer) are never split.
- Long tables flow across pages, rows are never cut in half, the header row repeats on every page, and column widths stay the same throughout.

### Images

```md
![Revenue chart](./assets/chart.svg "Quarterly revenue, $M"){width=60%}
```

- Relative paths resolve against the folder of the `.md` file, or the launch folder for a scratch pad.
- An image on its own line becomes a figure, and its quoted title becomes the caption.
- `{width=…}` sets the size.
- You can **drop or paste** an image into the editor. It's saved to `./assets/` and the link is inserted for you. A pasted screenshot gets a timestamped name, and existing files are never overwritten.

### Smart typography

This is on by default. Code and code blocks are never touched.

| You type | You get |
|---|---|
| `"quotes"` `'single'` `it's` `'90s` | “quotes” ‘single’ it’s ’90s |
| `--` `---` `...` | – — … |
| `1/2` `3 x 4` `(c)` | ½ 3 × 4 © |
| `450 ms`, `Dr. Smith`, `p. 3` | Non-breaking spaces keep these together |

The last two words of each paragraph are also joined with a non-breaking space, so no paragraph ends with a single word on its own line.

The themes add hyphenation, ligatures, kerning and balanced headings. Body text uses old-style figures and tables use aligned numbers.

## Front matter reference

Everything is optional. Anything you leave out comes from the theme.

```yaml
---
title: Q3 Report            # defaults to the first "# Heading"
author: Ada Ramirez
date: October 3, 2026       # defaults to today
lang: en                    # used for hyphenation and date format
theme: modern               # modern | classic | academic | minimal | github | fsai | resume
page:
  size: A4                  # A4, Letter, A5, Legal, "A4 landscape", or any CSS page size
  margin: 20mm              # any CSS margin, e.g. "22mm 18mm"
header:                     # or `false` to turn it off
  left: "{title}"
  right: "{date}"
  skipFirst: true           # nothing on page 1
footer:
  center: "Page {page} of {pages}"
breakBeforeH1: true
typography: true
fonts:
  body: Source Serif 4
  heading: Inter
  mono: JetBrains Mono
colors:
  text: "#1c1917"           # body copy and headings
  muted: "#78716c"          # secondary: captions, header/footer, labels
  quote: "#44403c"          # blockquotes
  accent: "#0f766e"         # headings, links, table header rows
---
```

Header and footer text can use `{title}`, `{author}`, `{date}`, `{page}` and `{pages}`.

## Themes

| Theme | Look |
|---|---|
| **Modern** | Source Serif body, Inter headings, coloured section heads, tinted table headers |
| **Classic** | Book typography: EB Garamond, justified text, indented paragraphs, drop cap |
| **Academic** | Paper style: numbered sections, booktabs tables, numbered figures |
| **Minimal** | One sans family, quiet hierarchy, generous whitespace |
| **GitHub** | README look: system font, ruled headings, gridded and striped tables |
| **FSAI** | Future Secure AI brand (Brand Guidelines V8): Montserrat only, black text, no italics (emphasis is Medium), black callouts and table heads, logo top-right on every page |
| **Resume** | Compact one-pager: large name, ruled section labels, tight lists |

**Fonts.** You can choose from 25 fonts:
- Serif: Source Serif 4, Libre Baskerville, Playfair Display, Merriweather, PT Serif, Crimson Text, Crimson Pro, EB Garamond, Lora
- Sans: Roboto, Inter, Open Sans, Lato, Montserrat, Raleway, Poppins, IBM Plex Sans, Work Sans, Fira Sans, System
- Mono: JetBrains Mono, IBM Plex Mono, Inconsolata, Space Mono, System Mono

Google fonts load on demand. **System** and **System Mono** use your operating system's fonts.

**Colours.** Every colour in every theme comes from the four palette colours. Borders, code backgrounds and table stripes are mixed from them, so a palette recolours the whole document. Colours inside images can't change.

## How it works

```
markdown + front matter
  → parseDoc / resolveSettings    built-in defaults < theme defaults < front matter
  → renderMarkdown                markdown-it + typography, page breaks, figures, image paths, table hints
  → compose                       full HTML: theme CSS, @page rules, header/footer margin boxes, fonts
  → preview iframe + Paged.js     splits the document into real pages; one cached iframe per theme
  → print()                       the browser's "Save as PDF" writes the file
```

- **Pagination** uses [Paged.js](https://pagedjs.org). It lays the document out into page boxes in the DOM, with CSS `@page` margin boxes for headers and footers. What you see is what prints.
- **Instant theme switching** comes from a pool of hidden iframes, one per theme, each cached by the exact HTML it rendered. Colours are applied as CSS variables on the live frames, so they never trigger a re-layout.
- **Split tables** are handled by a small Paged.js handler. It sizes the columns once from the whole table, then repeats the header row on each page the table continues onto.
- **Front-matter editing** uses the `yaml` Document API, which preserves your comments and layout. Title, author and date are kept at the top.

### Project layout

```
server/index.ts        local server: Vite middleware, /files (images), /api/doc (load/save), /api/upload
src/core/              framework-free pipeline (could also drive a headless CLI)
  config.ts            front matter parsing, settings merge, in-place YAML edits
  markdown.ts          markdown-it plugins: page breaks, figures, image paths, lead paragraph, table hints
  typography.ts        smart quotes, fractions, ×, non-breaking spaces, widow control
  compose.ts           builds the printable HTML document + Paged.js table handler
  fonts.ts, palettes.ts
src/app/               browser app (lit-html + CodeMirror)
  main.ts              state, rendering, tabs, shortcuts
  preview.ts           per-theme iframe pool, live colour variables, print
  toolbar.ts           theme chips, size, margins, typeface and colour pickers
  details.ts           Document form, synced with the front matter
  editor.ts            CodeMirror setup, image drop/paste
src/themes/            base.css (print mechanics) + one CSS file per theme, registry in index.ts
examples/              welcome.md, kitchen-sink.md, resume.md, fsai-report.md
```

### Adding a theme

1. Create `src/themes/<name>.css`. Style elements with the palette variables (`--text`, `--muted`, `--quote`, `--accent`) and the font variables (`--font-body`, `--font-heading`, `--font-mono`). Never hard-code colours.
2. Register it in `src/themes/index.ts` with its default fonts, colours, margins and header/footer.
3. For a logo, put the image in `src/themes/assets/`, import it with `?inline`, and set it as the theme's `logo` default (see the FSAI theme). It prints in the header's right slot whenever the header is shown and that slot has no text, and it's embedded in the page, so exported PDFs are self-contained.

Paged.js limitation: it rewrites `A + B` selectors, which drops pseudo-elements. A rule like `h1 + p::first-letter` silently disappears. Use the `p.lead` class (the paragraph after an H1) instead.

## Development

```sh
npm run dev -- examples/kitchen-sink.md   # run against the feature showcase
npm run typecheck
```
