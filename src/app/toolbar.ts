import { html, nothing } from "lit-html";
import type { DocSettings, Overrides, Slots } from "../core/config.ts";
import { FONTS, googleFontsUrl, type FontKind } from "../core/fonts.ts";
import { PALETTES, paletteMatches } from "../core/palettes.ts";
import { THEMES, type Theme } from "../themes/index.ts";

export type Popover = "fonts" | "colors" | null;
export type FontTarget = "both" | "body" | "heading" | "mono";
export type FontFilter = "all" | FontKind;

export interface ToolbarProps {
  settings: DocSettings;
  overrides: Overrides;
  theme: Theme;
  setSetting: (path: string[], value: unknown) => void;
  previewTheme: (id: string | null) => void;
  popover: Popover;
  setPopover: (p: Popover) => void;
  fontTarget: FontTarget;
  fontFilter: FontFilter;
  setFontUi: (ui: { target?: FontTarget; filter?: FontFilter }) => void;
}

const SIZES = ["A4", "A4 landscape", "Letter", "Letter landscape", "A5", "Legal"];
const MARGINS: [string, string][] = [
  ["Narrow", "12mm"],
  ["Normal", "20mm"],
  ["Wide", "28mm"],
];
const DEFAULT_HEADER: Slots = { left: "{title}", right: "{date}", skipFirst: true };
const DEFAULT_FOOTER: Slots = { center: "{page} / {pages}" };

// The problem is a toggle must be able to return to "whatever the theme does", not just on/off.
// The way we solve this is: turning on restores the theme's own header/footer if it has one (by deleting the override), else writes a default.
function toggleSlots(key: "header" | "footer", on: boolean, p: ToolbarProps) {
  const themeHas = !!p.theme.defaults[key];
  if (on) p.setSetting([key], themeHas ? undefined : key === "header" ? DEFAULT_HEADER : DEFAULT_FOOTER);
  else p.setSetting([key], themeHas ? false : undefined);
}

let uiFontsLoaded = false;

// The problem is the font picker should show each font in its own face, but loading 20+ families up front slows the app.
// The way we solve this is to load a light (regular weight only) copy of every family the first time the picker opens.
function loadPickerFonts() {
  if (uiFontsLoaded) return;
  uiFontsLoaded = true;
  for (const f of FONTS) {
    const href = googleFontsUrl(f.name, "wght@400");
    if (!href) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

const FONT_TARGETS: [FontTarget, string][] = [
  ["both", "Body & headings"],
  ["body", "Body"],
  ["heading", "Headings"],
  ["mono", "Code"],
];
const FONT_FILTERS: [FontFilter, string][] = [
  ["all", "All"],
  ["sans", "Sans"],
  ["serif", "Serif"],
  ["mono", "Mono"],
];

function currentFont(target: FontTarget, s: DocSettings): string | null {
  if (target === "both") return s.fonts.body === s.fonts.heading ? s.fonts.body : null;
  return s.fonts[target];
}

// The problem is "Body & headings" should be a single change, not two edits that re-render twice.
// The way we solve this is to write the whole fonts block at once; undefined means "back to the theme's font".
function applyFont(name: string | undefined, p: ToolbarProps) {
  const fonts = { ...p.overrides.fonts };
  const slots: ("body" | "heading" | "mono")[] = p.fontTarget === "both" ? ["body", "heading"] : [p.fontTarget];
  for (const slot of slots) fonts[slot] = name;
  for (const k of Object.keys(fonts) as (keyof typeof fonts)[]) if (!fonts[k]) delete fonts[k];
  p.setSetting(["fonts"], Object.keys(fonts).length ? fonts : undefined);
}

// The problem is choosing a typeface from a plain dropdown means guessing what each name looks like.
// The way we solve this is a picker that draws every font in its own face, filterable by style, applied to body, headings or code.
// flow: Preview tab — user opens Typeface and picks a font -> fontPicker() -> applyFont() <-- HERE
function fontPicker(p: ToolbarProps) {
  const s = p.settings;
  const current = currentFont(p.fontTarget, s);
  const kinds: FontKind[] = p.fontTarget === "mono" ? ["mono"] : p.fontFilter === "all" ? ["sans", "serif", "mono"] : [p.fontFilter];
  const fonts = FONTS.filter((f) => kinds.includes(f.kind));
  const label = s.fonts.body === s.fonts.heading ? s.fonts.body : `${s.fonts.heading} / ${s.fonts.body}`;
  if (p.popover === "fonts") loadPickerFonts();

  return html`
    <div class="pop-wrap">
      <button class="pop-trigger" aria-expanded=${p.popover === "fonts"} @click=${() => p.setPopover(p.popover === "fonts" ? null : "fonts")}>
        <span class="aa" style="font-family: ${s.fonts.heading}">Aa</span> ${label} <span class="caret">▾</span>
      </button>
      ${p.popover === "fonts"
        ? html`
            <div class="pop fonts-pop" role="dialog" aria-label="Typeface">
              <div class="seg" role="radiogroup" aria-label="Apply to">
                ${FONT_TARGETS.map(([t, name]) => html`<button role="radio" aria-checked=${p.fontTarget === t} @click=${() => p.setFontUi({ target: t })}>${name}</button>`)}
              </div>
              ${p.fontTarget === "mono"
                ? nothing
                : html`<div class="filters">
                    ${FONT_FILTERS.map(([f, name]) => html`<button class="filter" aria-pressed=${p.fontFilter === f} @click=${() => p.setFontUi({ filter: f })}>${name}</button>`)}
                  </div>`}
              <div class="font-list">
                <button class="font-card theme-default" @click=${() => applyFont(undefined, p)}>
                  <span class="font-name">Theme default</span>
                  <span class="font-blurb">${p.theme.name}'s own ${p.fontTarget === "mono" ? "code font" : "fonts"}</span>
                </button>
                ${fonts.map(
                  (f) => html`
                    <button class="font-card" aria-pressed=${f.name === current} @click=${() => applyFont(f.name, p)}>
                      <span class="font-name" style="font-family: ${f.stack ?? `'${f.name}'`}">${f.name}</span>
                      <span class="font-blurb">${f.blurb}</span>
                      <span class="font-aa" style="font-family: ${f.stack ?? `'${f.name}'`}">Aa</span>
                    </button>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

const dots = (text: string, muted: string, accent: string) => html`
  <span class="dots"><i style="background:${text}"></i><i style="background:${muted}"></i><i style="background:${accent}"></i></span>
`;

// The problem is picking three colours that work together is fiddly; most people want a tasteful preset.
// The way we solve this is preset text/secondary/accent palettes, plus a custom accent; all apply live without re-pagination.
// flow: Preview tab — user opens Colours and picks a palette -> colourPicker() -> setSetting(colors) <-- HERE
function colourPicker(p: ToolbarProps) {
  const c = p.overrides.colors;
  const s = p.settings;
  const fromTheme = !c || Object.keys(c).length === 0;
  return html`
    <div class="pop-wrap">
      <button class="pop-trigger" aria-expanded=${p.popover === "colors"} @click=${() => p.setPopover(p.popover === "colors" ? null : "colors")}>
        ${dots(s.colors.text ?? "#1c1917", s.colors.muted ?? "#78716c", s.colors.accent)} Colours <span class="caret">▾</span>
      </button>
      ${p.popover === "colors"
        ? html`
            <div class="pop colors-pop" role="dialog" aria-label="Colours">
              <div class="palette-grid">
                <button class="palette" aria-pressed=${fromTheme} title="Theme colours" @click=${() => p.setSetting(["colors"], undefined)}>
                  ${dots("#1c1917", "#78716c", p.theme.defaults.colors.accent)}
                  <span>Theme</span>
                </button>
                ${PALETTES.map(
                  (pal) => html`
                    <button class="palette" aria-pressed=${paletteMatches(pal, c)} title=${pal.name} @click=${() => p.setSetting(["colors"], { text: pal.text, muted: pal.muted, accent: pal.accent })}>
                      ${dots(pal.text, pal.muted, pal.accent)}
                      <span>${pal.name}</span>
                    </button>
                  `,
                )}
              </div>
              <label class="field custom-accent">
                <span>Custom accent</span>
                <input type="color" .value=${s.colors.accent} @input=${(e: Event) => p.setSetting(["colors", "accent"], (e.target as HTMLInputElement).value)} />
              </label>
            </div>
          `
        : nothing}
    </div>
  `;
}

// The problem is the user wants to try looks quickly — themes, paper, margins, fonts, colour — without hand-editing YAML.
// The way we solve this is a toolbar whose every control writes into the front matter; hovering a theme previews it without committing.
// flow: Preview tab — user changes any control -> toolbar() -> setSetting() <-- HERE
export function toolbar(p: ToolbarProps) {
  const { settings, overrides } = p;
  const margin = overrides.page?.margin;
  const marginKnown = MARGINS.some(([, v]) => v === margin);

  return html`
    <div class="themes" role="radiogroup" aria-label="Theme" @mouseleave=${() => p.previewTheme(null)}>
      ${THEMES.map(
        (t) => html`
          <button
            role="radio"
            class="chip"
            aria-checked=${t.id === p.theme.id}
            style="--chip: ${t.defaults.colors.accent}"
            @mouseenter=${() => p.previewTheme(t.id)}
            @click=${() => p.setSetting(["theme"], t.id)}
          >
            ${t.name}
          </button>
        `,
      )}
    </div>
    <span class="sep"></span>
    <label class="field">
      <span>Size</span>
      <select @change=${(e: Event) => p.setSetting(["page", "size"], (e.target as HTMLSelectElement).value)}>
        ${SIZES.map((s) => html`<option .selected=${s === settings.page.size}>${s}</option>`)}
        ${SIZES.includes(settings.page.size) ? nothing : html`<option .selected=${true}>${settings.page.size}</option>`}
      </select>
    </label>
    <label class="field">
      <span>Margins</span>
      <select @change=${(e: Event) => p.setSetting(["page", "margin"], (e.target as HTMLSelectElement).value || undefined)}>
        <option value="" .selected=${!margin}>Theme · ${p.theme.defaults.page?.margin ?? "20mm"}</option>
        ${MARGINS.map(([name, v]) => html`<option value=${v} .selected=${v === margin}>${name} · ${v}</option>`)}
        ${margin && !marginKnown ? html`<option value=${margin} .selected=${true}>Custom · ${margin}</option>` : nothing}
      </select>
    </label>
    ${fontPicker(p)} ${colourPicker(p)}
    <span class="sep"></span>
    <label class="check"><input type="checkbox" .checked=${!!settings.header} @change=${(e: Event) => toggleSlots("header", (e.target as HTMLInputElement).checked, p)} /> Header</label>
    <label class="check"><input type="checkbox" .checked=${!!settings.footer} @change=${(e: Event) => toggleSlots("footer", (e.target as HTMLInputElement).checked, p)} /> Footer</label>
    <label class="check" title="Start every H1 on a new page">
      <input type="checkbox" .checked=${settings.breakBeforeH1} @change=${(e: Event) => p.setSetting(["breakBeforeH1"], (e.target as HTMLInputElement).checked || undefined)} /> Chapter breaks
    </label>
    <label class="check" title="Curly quotes, dashes, ellipses, non-breaking spaces">
      <input type="checkbox" .checked=${settings.typography} @change=${(e: Event) => p.setSetting(["typography"], (e.target as HTMLInputElement).checked ? undefined : false)} /> Smart typography
    </label>
  `;
}
