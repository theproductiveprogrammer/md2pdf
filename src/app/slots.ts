import type { Slots } from "../core/config.ts";
import type { Theme } from "../themes/index.ts";

export type SlotKey = "header" | "footer";

const DEFAULTS: Record<SlotKey, Slots> = {
  header: { left: "{title}", right: "{date}", skipFirst: true },
  footer: { center: "{page} / {pages}" },
};

// The problem is turning a header/footer back on should restore "whatever the theme does", not just a generic default.
// The way we solve this is: on restores the theme's own set if it has one (by deleting the override), else writes a default;
// off writes `false` over a theme default, or simply removes the user's own set.
// flow: Write tab — user ticks Header/Footer in the Document form -> toggleSlots() <-- HERE
// flow: Preview tab — user ticks Header/Footer in the toolbar -> toggleSlots() <-- HERE
export function toggleSlots(key: SlotKey, on: boolean, theme: Theme, setSetting: (path: string[], value: unknown) => void) {
  const themeHas = !!theme.defaults[key];
  if (on) setSetting([key], themeHas ? undefined : DEFAULTS[key]);
  else setSetting([key], themeHas ? false : undefined);
}
