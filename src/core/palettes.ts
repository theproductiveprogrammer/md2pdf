export interface Palette {
  name: string;
  text: string;
  muted: string;
  accent: string;
}

// Text / secondary text / accent sets, after markdowntopdf.com's colour swatches.
export const PALETTES: Palette[] = [
  { name: "Teal", text: "#1a1f2e", muted: "#3d4655", accent: "#3e8e82" },
  { name: "Ink & Blue", text: "#111111", muted: "#5f6368", accent: "#2f6fd6" },
  { name: "Royal", text: "#1c1c1e", muted: "#2c2c2e", accent: "#3b63e0" },
  { name: "Copper", text: "#1f1f1f", muted: "#2e2e2e", accent: "#a8572a" },
  { name: "Forest", text: "#262626", muted: "#4a4a48", accent: "#3a7a5a" },
  { name: "Navy", text: "#141b2d", muted: "#3b4252", accent: "#253a8a" },
  { name: "Crimson", text: "#1f1f1f", muted: "#4a4644", accent: "#b0293d" },
  { name: "Harbor", text: "#1f3b5e", muted: "#3c4658", accent: "#3e86c8" },
  { name: "Rust", text: "#262626", muted: "#4a4644", accent: "#b5532a" },
  { name: "Cherry", text: "#1c1c1e", muted: "#45454a", accent: "#d63b4b" },
];

const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export const paletteMatches = (p: Palette, c: { text?: string; muted?: string; accent?: string } | undefined) =>
  !!c && same(c.text, p.text) && same(c.muted, p.muted) && same(c.accent, p.accent);
