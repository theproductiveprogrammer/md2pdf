import { html, nothing } from "lit-html";
import type { DocSettings, Overrides, Slots } from "../core/config.ts";
import { FONTS, type FontKind } from "../core/fonts.ts";
import { THEMES, type Theme } from "../themes/index.ts";

export interface ToolbarProps {
  settings: DocSettings;
  overrides: Overrides;
  theme: Theme;
  setSetting: (path: string[], value: unknown) => void;
  previewTheme: (id: string | null) => void;
}

const SIZES = ["A4", "Letter", "A5", "Legal"];
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

function fontSelect(label: string, slot: "body" | "heading", p: ToolbarProps) {
  const current = p.overrides.fonts?.[slot] ?? "";
  const themeFont = p.theme.defaults.fonts[slot];
  const known = FONTS.some((f) => f.name === current);
  const group = (kind: FontKind, title: string) => html`
    <optgroup label=${title}>
      ${FONTS.filter((f) => f.kind === kind).map((f) => html`<option .selected=${f.name === current} value=${f.name}>${f.name}</option>`)}
    </optgroup>
  `;
  return html`
    <label class="field">
      <span>${label}</span>
      <select @change=${(e: Event) => p.setSetting(["fonts", slot], (e.target as HTMLSelectElement).value || undefined)}>
        <option value="" .selected=${!current}>Theme · ${themeFont}</option>
        ${current && !known ? html`<option .selected=${true} value=${current}>${current}</option>` : nothing}
        ${group("serif", "Serif")} ${group("sans", "Sans")}
      </select>
    </label>
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
    ${fontSelect("Body", "body", p)} ${fontSelect("Headings", "heading", p)}
    <label class="field color">
      <span>Accent</span>
      <input type="color" .value=${settings.colors.accent} @input=${(e: Event) => p.setSetting(["colors", "accent"], (e.target as HTMLInputElement).value)} />
      ${overrides.colors?.accent
        ? html`<button class="reset" title="Back to theme colour" @click=${() => p.setSetting(["colors", "accent"], undefined)}>↺</button>`
        : nothing}
    </label>
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
