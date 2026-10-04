import { html, nothing } from "lit-html";
import type { Colors, DocSettings, Overrides } from "../core/config.ts";
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

const dots = (c: Colors) => html`
  <span class="dots">${[c.text, c.muted, c.quote, c.accent].map((v) => html`<i style="background:${v}"></i>`)}</span>
`;

const COLOUR_FIELDS: [keyof Colors, string][] = [
  ["text", "Text"],
  ["muted", "Secondary"],
  ["quote", "Quote"],
  ["accent", "Accent"],
];

// The problem is picking colours that work together is fiddly; most people want a tasteful preset, then maybe one tweak.
// The way we solve this is preset text/secondary/quote/accent palettes plus a picker per colour; all apply live without re-pagination.
// flow: Preview tab — user opens Colours and picks a palette or a colour -> colourPicker() -> setSetting(colors) <-- HERE
function colourPicker(p: ToolbarProps) {
  const c = p.overrides.colors;
  const s = p.settings;
  const fromTheme = !c || Object.keys(c).length === 0;
  return html`
    <div class="pop-wrap">
      <button class="pop-trigger" aria-expanded=${p.popover === "colors"} @click=${() => p.setPopover(p.popover === "colors" ? null : "colors")}>
        ${dots(s.colors)} Colours <span class="caret">▾</span>
      </button>
      ${p.popover === "colors"
        ? html`
            <div class="pop colors-pop" role="dialog" aria-label="Colours">
              <div class="palette-grid">
                <button class="palette" aria-pressed=${fromTheme} title="${p.theme.name} theme colours" @click=${() => p.setSetting(["colors"], undefined)}>
                  ${dots(p.theme.defaults.colors)}
                  <span>Theme</span>
                </button>
                ${PALETTES.map(
                  (pal) => html`
                    <button
                      class="palette"
                      aria-pressed=${paletteMatches(pal, c)}
                      title=${pal.name}
                      @click=${() => p.setSetting(["colors"], { text: pal.text, muted: pal.muted, quote: pal.quote, accent: pal.accent })}
                    >
                      ${dots(pal)}
                      <span>${pal.name}</span>
                    </button>
                  `,
                )}
              </div>
              <div class="colour-fields">
                ${COLOUR_FIELDS.map(
                  ([key, label]) => html`
                    <label class="colour-field">
                      <input type="color" .value=${s.colors[key]} @input=${(e: Event) => p.setSetting(["colors", key], (e.target as HTMLInputElement).value)} />
                      <span>${label}</span>
                    </label>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

// The problem is the user wants to try looks quickly — themes, paper, margins, fonts, colour — against the real pages.
// Content options (header/footer, chapter breaks, typography) live in the Document form on the Write tab instead.
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
  `;
}
