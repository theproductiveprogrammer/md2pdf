export type FontKind = "serif" | "sans" | "mono";

export interface Font {
  name: string;
  kind: FontKind;
  // Locally installed fonts addressed by CSS keyword stacks rather than downloaded from Google.
  stack?: string;
}

// Curated Google Fonts (each verified to serve 400/600/700 + italics, so no faux bold), plus the OS system fonts.
export const FONTS: Font[] = [
  { name: "Source Serif 4", kind: "serif" },
  { name: "EB Garamond", kind: "serif" },
  { name: "Crimson Pro", kind: "serif" },
  { name: "Lora", kind: "serif" },
  { name: "Merriweather", kind: "serif" },
  { name: "Playfair Display", kind: "serif" },
  { name: "Inter", kind: "sans" },
  { name: "IBM Plex Sans", kind: "sans" },
  { name: "Work Sans", kind: "sans" },
  { name: "Fira Sans", kind: "sans" },
  { name: "System", kind: "sans", stack: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif' },
  { name: "JetBrains Mono", kind: "mono" },
  { name: "IBM Plex Mono", kind: "mono" },
  { name: "System Mono", kind: "mono", stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
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

// Understand: one <link> per family, so a single unavailable font can't 400 the whole request and take the others down with it.
export function googleFontsUrl(name: string): string | null {
  const font = FONTS.find((f) => f.name === name);
  if (!font || font.stack) return null;
  return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:ital,wght@0,400;0,600;0,700;1,400;1,700&display=swap`;
}
