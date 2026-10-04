import { html } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { DocSettings, Overrides, Slots } from "../core/config.ts";
import type { Theme } from "../themes/index.ts";
import { toggleSlots, type SlotKey } from "./slots.ts";

export interface DetailsProps {
  open: boolean;
  overrides: Overrides;
  settings: DocSettings;
  fallbackTitle: string;
  theme: Theme;
  error: string | null;
  setSetting: (path: string[], value: unknown, opts?: { debounce: boolean }) => void;
  setOpen: (open: boolean) => void;
}

type Side = "left" | "center" | "right";
const SIDES: Side[] = ["left", "center", "right"];
const TOKENS = "{title} {author} {date} {page} {pages}";

// The problem is a theme's default header/footer should keep printing until the user actually changes it.
// The way we solve this is to start an edit from whatever is currently in effect (front matter, else theme default) and write the whole set back.
function slotBase(key: SlotKey, p: DetailsProps): Slots {
  const o = p.overrides[key];
  return o === undefined ? { ...(p.theme.defaults[key] || {}) } : { ...(o || {}) };
}

// Understand: on/off is the row's checkbox, so clearing every slot never switches it off — over a theme default it leaves an empty
// set (the theme logo, if any, still shows); otherwise it removes the key.
function writeSlots(key: SlotKey, next: Slots, p: DetailsProps, debounce: boolean) {
  const clean: Slots = {};
  for (const side of SIDES) if (next[side]) clean[side] = next[side];
  if (next.skipFirst) clean.skipFirst = true;
  const empty = !SIDES.some((s) => clean[s]);
  p.setSetting([key], empty && !p.theme.defaults[key] ? undefined : clean, { debounce });
}

// The problem is the user needs to see and control whether a header/footer prints, right where they edit its text.
// The way we solve this is a show checkbox on each row; while off, the slots are disabled. The header's empty right slot reads
// "logo" when the theme has one, since that's what will print there.
// flow: Write tab — user ticks Header/Footer or edits a slot -> slotRow() -> toggleSlots()/writeSlots() <-- HERE
function slotRow(key: SlotKey, label: string, p: DetailsProps) {
  const current = p.overrides[key];
  const shown = !!p.settings[key];
  const themeSlots = p.theme.defaults[key] || {};
  const values: Slots = current === undefined ? {} : current || {};
  const skipFirst = current === undefined ? !!themeSlots.skipFirst : !!(current && current.skipFirst);
  const placeholder = (side: Side) => {
    if (!shown) return "";
    if (current === undefined && themeSlots[side]) return themeSlots[side]!;
    if (key === "header" && side === "right" && p.theme.defaults.logo) return "logo";
    return side;
  };
  return html`
    <label class="check row-label">
      <input type="checkbox" .checked=${live(shown)} @change=${(e: Event) => toggleSlots(key, (e.target as HTMLInputElement).checked, p.theme, p.setSetting)} />
      ${label}
    </label>
    ${SIDES.map(
      (side) => html`
        <input
          class="slot"
          aria-label="${label} ${side}"
          ?disabled=${!shown}
          .value=${live(shown ? values[side] ?? "" : "")}
          placeholder=${placeholder(side)}
          @input=${(e: Event) => writeSlots(key, { ...slotBase(key, p), [side]: (e.target as HTMLInputElement).value }, p, true)}
        />
      `,
    )}
    <label class="check">
      <input
        type="checkbox"
        ?disabled=${!shown}
        .checked=${live(skipFirst)}
        @change=${(e: Event) => writeSlots(key, { ...slotBase(key, p), skipFirst: (e.target as HTMLInputElement).checked }, p, false)}
      />
      Skip first page
    </label>
  `;
}

const textField = (label: string, key: "title" | "author" | "date", placeholder: string, p: DetailsProps, wide = false) => html`
  <label class="text-field ${wide ? "wide" : ""}">
    <span>${label}</span>
    <input
      .value=${live(p.overrides[key] ?? "")}
      placeholder=${placeholder}
      @input=${(e: Event) => p.setSetting([key], (e.target as HTMLInputElement).value || undefined, { debounce: true })}
    />
  </label>
`;

// The problem is the user shouldn't have to know YAML to set a title, author or running header — but power users still want to edit the YAML.
// The way we solve this is a form that reads from and writes to the front matter in the editor, so both stay in sync both ways.
// flow: Write tab — user fills in Title/Author/Date/Header/Footer -> details() -> setSetting() <-- HERE
export function details(p: DetailsProps) {
  return html`
    <details class="doc-details" ?open=${p.open} @toggle=${(e: Event) => p.setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span>Document</span>
        <span class="summary-hint">${p.settings.title}${p.settings.author ? ` · ${p.settings.author}` : ""}</span>
      </summary>
      ${p.error
        ? html`<p class="form-error">${p.error} — fix the YAML in the editor below to use this form.</p>`
        : html`
            <div class="form-grid">
              ${textField("Title", "title", p.fallbackTitle, p, true)} ${textField("Author", "author", "Your name", p)}
              ${textField("Date", "date", p.settings.date, p)}
            </div>
            <div class="slot-grid">${slotRow("header", "Header", p)} ${slotRow("footer", "Footer", p)}</div>
            <div class="options">
              <span class="row-label">Options</span>
              <label class="check" title="Start every top-level heading on a new page">
                <input
                  type="checkbox"
                  .checked=${live(p.settings.breakBeforeH1)}
                  @change=${(e: Event) => p.setSetting(["breakBeforeH1"], (e.target as HTMLInputElement).checked || undefined)}
                />
                Chapter breaks
              </label>
              <label class="check" title="Curly quotes, dashes, ellipses, fractions, non-breaking spaces">
                <input
                  type="checkbox"
                  .checked=${live(p.settings.typography)}
                  @change=${(e: Event) => p.setSetting(["typography"], (e.target as HTMLInputElement).checked ? undefined : false)}
                />
                Smart typography
              </label>
            </div>
            <p class="form-hint">
              Use ${TOKENS.split(" ").map((t) => html`<code>${t}</code> `)}in header/footer text. Grey text is the theme's default${p.theme.defaults.logo
                ? html`; ${p.theme.name}'s logo prints in the header's right slot when it's empty`
                : ""}.
            </p>
          `}
    </details>
  `;
}
