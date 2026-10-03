import { html } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { DocSettings, Overrides, Slots } from "../core/config.ts";
import type { Theme } from "../themes/index.ts";

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

type SlotKey = "header" | "footer";
type Side = "left" | "center" | "right";
const SIDES: Side[] = ["left", "center", "right"];
const TOKENS = "{title} {author} {date} {page} {pages}";

// The problem is a theme's default header/footer should keep printing until the user actually changes it.
// The way we solve this is to start an edit from whatever is currently in effect (front matter, else theme default) and write the whole set back.
function slotBase(key: SlotKey, p: DetailsProps): Slots {
  const o = p.overrides[key];
  return o === undefined ? { ...(p.theme.defaults[key] || {}) } : { ...(o || {}) };
}

// Understand: clearing every slot writes `false` when the theme has its own default (so it really disappears), otherwise removes the key.
function writeSlots(key: SlotKey, next: Slots, p: DetailsProps, debounce: boolean) {
  const clean: Slots = {};
  for (const side of SIDES) if (next[side]) clean[side] = next[side];
  if (!SIDES.some((s) => clean[s])) return p.setSetting([key], p.theme.defaults[key] ? false : undefined, { debounce });
  if (next.skipFirst) clean.skipFirst = true;
  p.setSetting([key], clean, { debounce });
}

function slotRow(key: SlotKey, label: string, p: DetailsProps) {
  const current = p.overrides[key];
  const themeSlots = p.theme.defaults[key] || {};
  const values: Slots = current === undefined ? {} : current || {};
  const skipFirst = current === undefined ? !!themeSlots.skipFirst : !!(current && current.skipFirst);
  return html`
    <span class="row-label">${label}</span>
    ${SIDES.map(
      (side) => html`
        <input
          class="slot"
          aria-label="${label} ${side}"
          .value=${live(values[side] ?? "")}
          placeholder=${current === undefined && themeSlots[side] ? themeSlots[side]! : side}
          @input=${(e: Event) => writeSlots(key, { ...slotBase(key, p), [side]: (e.target as HTMLInputElement).value }, p, true)}
        />
      `,
    )}
    <label class="check">
      <input
        type="checkbox"
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
            <p class="form-hint">
              Use ${TOKENS.split(" ").map((t) => html`<code>${t}</code> `)}in header/footer text. Grey text is the theme's default.
            </p>
          `}
    </details>
  `;
}
