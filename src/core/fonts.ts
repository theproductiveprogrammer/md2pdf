export type FontKind = "serif" | "sans" | "mono";

export interface Font {
  name: string;
  kind: FontKind;
  blurb: string;
  // Locally installed fonts addressed by CSS keyword stacks rather than downloaded from Google.
  stack?: string;
}

// Google Fonts plus the OS system fonts. Google silently skips weights a family lacks (e.g. Lato has no 600),
// so one weight request fits all; the browser falls back to the nearest weight.
export const FONTS: Font[] = [
  { name: "Source Serif 4", kind: "serif", blurb: "Editorial body serif" },
  { name: "Libre Baskerville", kind: "serif", blurb: "Serif for papers & notes" },
  { name: "Playfair Display", kind: "serif", blurb: "Magazine-style headings" },
  { name: "Merriweather", kind: "serif", blurb: "Sturdy serif for long reads" },
  { name: "PT Serif", kind: "serif", blurb: "Plain, dependable serif" },
  { name: "Crimson Text", kind: "serif", blurb: "Old-style book serif" },
  { name: "Crimson Pro", kind: "serif", blurb: "Contemporary book serif" },
  { name: "EB Garamond", kind: "serif", blurb: "Renaissance book face" },
  { name: "Lora", kind: "serif", blurb: "Calligraphic, warm serif" },
  { name: "Roboto", kind: "sans", blurb: "Familiar README look" },
  { name: "Outfit", kind: "sans", blurb: "Geometric, friendly display sans" },
  { name: "Inter", kind: "sans", blurb: "Crisp, neutral UI sans" },
  { name: "Open Sans", kind: "sans", blurb: "Friendly and highly legible" },
  { name: "Lato", kind: "sans", blurb: "Friendly neutral sans" },
  { name: "Montserrat", kind: "sans", blurb: "Sans-serif for business docs" },
  { name: "Raleway", kind: "sans", blurb: "Elegant, light-stroked sans" },
  { name: "Poppins", kind: "sans", blurb: "Rounded geometric sans" },
  { name: "IBM Plex Sans", kind: "sans", blurb: "High-contrast modern look" },
  { name: "Work Sans", kind: "sans", blurb: "Grotesque for reports" },
  { name: "Fira Sans", kind: "sans", blurb: "Warm humanist sans" },
  { name: "System", kind: "sans", blurb: "Your operating system's font", stack: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif' },
  { name: "JetBrains Mono", kind: "mono", blurb: "Code-first monospace" },
  { name: "IBM Plex Mono", kind: "mono", blurb: "Corporate monospace" },
  { name: "Inconsolata", kind: "mono", blurb: "Clean, compact monospace" },
  { name: "Space Mono", kind: "mono", blurb: "Retro geometric monospace" },
  { name: "System Mono", kind: "mono", blurb: "Your operating system's monospace", stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
];

const FALLBACK: Record<FontKind, string> = {
  serif: "Georgia, serif",
  sans: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, Menlo, monospace",
};

// The problem is the user may name any font, including ones installed locally that Google doesn't serve.
// The way we solve this is to always emit a CSS stack with a sensible fallback for the slot (body/heading/mono).
export function fontStack(name: string, slot: FontKind): string {
  const font = FONTS.find((f) => f.name === name);
  if (font?.stack) return font.stack;
  return `"${name.replace(/"/g, "")}", ${FALLBACK[font?.kind ?? slot]}`;
}

// Understand: one <link> per family, so a single unavailable font can't fail the whole request and take the others down with it.
export function googleFontsUrl(name: string, weights = "ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,700"): string | null {
  const font = FONTS.find((f) => f.name === name);
  if (!font || font.stack) return null;
  return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:${weights}&display=swap`;
}
