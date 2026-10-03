---
title: Welcome to md2pdf
footer: { left: "{title}", right: "{page} / {pages}" }
---

# Welcome to md2pdf

Type markdown here, then press **⌘↵** to see the pages. "Smart quotes" -- and dashes --- just happen... It's the '90s all over again.

## Front matter

The YAML block at the top controls the page: `title`, `page.size`, `page.margin`, `header`, `footer`, `breakBeforeH1`.

Header and footer slots accept `{title}`, `{author}`, `{date}`, `{page}` and `{pages}`.

## Page breaks

Put `\pagebreak` on its own line to start a new page.

\pagebreak

# Page two

This paragraph starts on a fresh page. Images next to your `.md` file work with relative paths, e.g. `![Chart](./assets/chart.svg){width=60%}`.
