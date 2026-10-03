import type { ThemeDefaults } from "../core/config.ts";
import base from "./base.css?raw";
import modern from "./modern.css?raw";
import classic from "./classic.css?raw";
import academic from "./academic.css?raw";
import minimal from "./minimal.css?raw";
import resume from "./resume.css?raw";

export interface Theme {
  id: string;
  name: string;
  css: string;
  defaults: ThemeDefaults;
}

export const DEFAULT_THEME = "modern";

export const THEMES: Theme[] = [
  {
    id: "modern",
    name: "Modern",
    css: base + modern,
    defaults: {
      page: { margin: "20mm 18mm" },
      footer: { center: "{page} / {pages}" },
      fonts: { body: "Source Serif 4", heading: "Inter", mono: "JetBrains Mono" },
      colors: { accent: "#0f766e" },
    },
  },
  {
    id: "classic",
    name: "Classic",
    css: base + classic,
    defaults: {
      page: { margin: "25mm 24mm" },
      header: { center: "{title}", skipFirst: true },
      footer: { center: "{page}" },
      fonts: { body: "EB Garamond", heading: "EB Garamond", mono: "IBM Plex Mono" },
      colors: { accent: "#7f1d1d" },
    },
  },
  {
    id: "academic",
    name: "Academic",
    css: base + academic,
    defaults: {
      page: { margin: "25mm" },
      footer: { center: "{page}" },
      fonts: { body: "Crimson Pro", heading: "Crimson Pro", mono: "IBM Plex Mono" },
      colors: { accent: "#1e3a8a" },
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    css: base + minimal,
    defaults: {
      page: { margin: "24mm 22mm" },
      footer: { right: "{page}" },
      fonts: { body: "Inter", heading: "Inter", mono: "IBM Plex Mono" },
      colors: { accent: "#171717" },
    },
  },
  {
    id: "resume",
    name: "Resume",
    css: base + resume,
    defaults: {
      page: { margin: "14mm 16mm" },
      footer: false,
      fonts: { body: "IBM Plex Sans", heading: "IBM Plex Sans", mono: "IBM Plex Mono" },
      colors: { accent: "#1d4ed8" },
    },
  },
];

export const themeById = (id: string | undefined): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
