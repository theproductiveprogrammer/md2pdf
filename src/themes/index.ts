import type { ThemeDefaults } from "../core/config.ts";
import base from "./base.css?raw";
import modern from "./modern.css?raw";
import classic from "./classic.css?raw";
import academic from "./academic.css?raw";
import minimal from "./minimal.css?raw";
import resume from "./resume.css?raw";
import github from "./github.css?raw";
import fsai from "./fsai.css?raw";
import fsaiLogo from "./assets/fsai-logo.png?inline";
import salesbox from "./salesbox.css?raw";
import salesboxLogo from "./assets/salesbox-logo-icon.svg?inline";

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
      colors: { text: "#1c1917", muted: "#78716c", quote: "#44403c", accent: "#0f766e" },
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
      colors: { text: "#1a1714", muted: "#6b635b", quote: "#3a332d", accent: "#7f1d1d" },
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
      colors: { text: "#111111", muted: "#555555", quote: "#333333", accent: "#1e3a8a" },
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
      colors: { text: "#171717", muted: "#737373", quote: "#737373", accent: "#171717" },
    },
  },
  {
    id: "github",
    name: "GitHub",
    css: base + github,
    defaults: {
      page: { margin: "18mm 16mm" },
      footer: { center: "{page} / {pages}" },
      fonts: { body: "System", heading: "System", mono: "System Mono" },
      colors: { text: "#1f2328", muted: "#59636e", quote: "#59636e", accent: "#0969da" },
    },
  },
  {
    id: "fsai",
    name: "FSAI",
    css: base + fsai,
    defaults: {
      page: { margin: "24mm 18mm 20mm" },
      header: { left: "{title}", right: "{logo}" },
      footer: { right: "{page}" },
      fonts: { body: "Montserrat", heading: "Montserrat", mono: "System Mono" },
      colors: { text: "#000000", muted: "#8c8c8c", quote: "#000000", accent: "#096c93" },
      // The {logo} image (top-right of the header, per the brand guidelines); embedded so exported PDFs are self-contained.
      logo: fsaiLogo,
    },
  },
  {
    id: "salesbox",
    name: "Salesbox",
    css: base + salesbox,
    defaults: {
      page: { margin: "22mm 18mm 20mm" },
      header: { left: "{logo}", right: "{title}" },
      footer: { left: "salesbox.ai", right: "{page} / {pages}" },
      fonts: { body: "Outfit", heading: "Outfit", mono: "JetBrains Mono" },
      colors: { text: "#1a0d26", muted: "#7a6890", quote: "#402d53", accent: "#ed457d" },
      // The salesbox.ai icon (indigo→pink gradient), embedded so exported PDFs are self-contained.
      logo: salesboxLogo,
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
      colors: { text: "#1e293b", muted: "#64748b", quote: "#475569", accent: "#1d4ed8" },
    },
  },
];

export const themeById = (id: string | undefined): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
