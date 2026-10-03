import type { Colors } from "./config.ts";

export interface Palette extends Colors {
  name: string;
}

// Text / secondary / quote / accent sets; text, secondary and accent follow markdowntopdf.com's swatches.
export const PALETTES: Palette[] = [
  { name: "Teal", text: "#1a1f2e", muted: "#3d4655", quote: "#5f6b7a", accent: "#3e8e82" },
  { name: "Ink & Blue", text: "#111111", muted: "#5f6368", quote: "#6b7785", accent: "#2f6fd6" },
  { name: "Royal", text: "#1c1c1e", muted: "#2c2c2e", quote: "#555a66", accent: "#3b63e0" },
  { name: "Copper", text: "#1f1f1f", muted: "#2e2e2e", quote: "#6b5a4e", accent: "#a8572a" },
  { name: "Forest", text: "#262626", muted: "#4a4a48", quote: "#56665c", accent: "#3a7a5a" },
  { name: "Navy", text: "#141b2d", muted: "#3b4252", quote: "#556079", accent: "#253a8a" },
  { name: "Crimson", text: "#1f1f1f", muted: "#4a4644", quote: "#6b5a5c", accent: "#b0293d" },
  { name: "Harbor", text: "#1f3b5e", muted: "#3c4658", quote: "#5a7189", accent: "#3e86c8" },
  { name: "Rust", text: "#262626", muted: "#4a4644", quote: "#6e5b50", accent: "#b5532a" },
  { name: "Cherry", text: "#1c1c1e", muted: "#45454a", quote: "#6d5f63", accent: "#d63b4b" },
];

const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export const paletteMatches = (p: Palette, c: Partial<Colors> | undefined) =>
  !!c && same(c.text, p.text) && same(c.muted, p.muted) && same(c.quote, p.quote) && same(c.accent, p.accent);
