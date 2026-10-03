---
title: Welcome to md2pdf
footer: { left: "{title}", right: "{page} / {pages}" }
---

# Welcome to md2pdf

Type markdown here, then press **⌘↵** to see the pages. "Smart quotes" -- and dashes --- just happen... It's the '90s all over again.

## Themes & settings

On the Preview tab, pick a theme (hover to try one, or press `[` and `]`), paper size, margins, fonts and accent colour. Every choice is written into the YAML block at the top, so it's saved with the document.

You can also edit that YAML by hand: `theme`, `page.size`, `page.margin`, `fonts.body`, `fonts.heading`, `colors.accent`, `header`, `footer`, `breakBeforeH1`, `typography`.

Header and footer slots accept `{title}`, `{author}`, `{date}`, `{page}` and `{pages}`.

## Page breaks

Put `\pagebreak` on its own line to start a new page.

\pagebreak

# Page two

This paragraph starts on a fresh page.

## Images

Drop or paste an image into the editor: it's saved to `./assets/` next to your document and linked for you. Relative paths like `![Chart](./assets/chart.svg "Revenue by quarter"){width=60%}` work too; the quoted title becomes the figure caption.
