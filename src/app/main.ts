import { html, render } from "lit-html";
import type { EditorView } from "codemirror";
import { editFrontMatter, parseDoc, resolveSettings, type DocSettings, type ParsedDoc } from "../core/config.ts";
import { renderMarkdown } from "../core/markdown.ts";
import { compose } from "../core/compose.ts";
import { THEMES, themeById, type Theme } from "../themes/index.ts";
import { createEditor } from "./editor.ts";
import { PreviewPool, type RenderResult } from "./preview.ts";
import { toolbar, type FontFilter, type FontTarget, type Popover } from "./toolbar.ts";
import { details } from "./details.ts";
import sample from "../../examples/welcome.md?raw";

type Tab = "write" | "preview";

const DRAFT_KEY = "md2pdf:draft";
const DETAILS_OPEN_KEY = "md2pdf:details-open";
const RENDER_DEBOUNCE_MS = 400;

const state = {
  docPath: null as string | null,
  text: "",
  savedText: "",
  tab: "write" as Tab,
  rendering: false,
  error: null as string | null,
  parsed: null as ParsedDoc | null,
  theme: THEMES[0] as Theme,
  settings: null as DocSettings | null,
  hoverTheme: null as string | null,
  detailsOpen: true,
  popover: null as Popover,
  fontTarget: "both" as FontTarget,
  fontFilter: "all" as FontFilter,
  htmlFor: (_t: Theme) => "",
};

const bar = document.getElementById("bar")!;
const tools = document.getElementById("tools")!;
const writePane = document.getElementById("write")!;
const detailsHost = document.getElementById("details")!;
const editorHost = document.getElementById("editor")!;
const previewPane = document.getElementById("preview")!;
const pool = new PreviewPool(previewPane);
let editor: EditorView;
let renderTimer: number | undefined;
let generation = 0;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the value just won't survive a reload.
  }
}

const docDir = () => (state.docPath?.includes("/") ? state.docPath.slice(0, state.docPath.lastIndexOf("/")) : "");

// The problem is the app can be launched on a .md file (edit it in place) or on a folder (scratch pad).
// The way we solve this is to ask the server which doc it was started with and fall back to the last draft or the welcome sample.
// flow: app start -> main() -> loadSession() <-- HERE
async function loadSession(): Promise<void> {
  const session = (await (await fetch("/api/session")).json()) as { doc: string | null };
  state.docPath = session.doc;
  if (session.doc) {
    const res = await fetch(`/api/doc?path=${encodeURIComponent(session.doc)}`);
    state.text = res.ok ? await res.text() : "";
  } else {
    state.text = readStored(DRAFT_KEY) ?? sample;
  }
  state.savedText = state.text;
}

// The problem is the user expects ⌘S to write their edits back to the .md file on disk.
// The way we solve this is a PUT to the local server; scratch pads have no file, so they autosave to the browser instead.
// flow: Write tab — user presses ⌘S -> saveDoc() <-- HERE
async function saveDoc() {
  if (!state.docPath) return;
  const text = state.text;
  const res = await fetch(`/api/doc?path=${encodeURIComponent(state.docPath)}`, { method: "PUT", body: text });
  if (res.ok) state.savedText = text;
  else state.error = `Save failed: ${res.status}`;
  draw();
}

// flow: Write tab — user drops/pastes an image -> insertImages() -> uploadImage() <-- HERE
async function uploadImage(file: File): Promise<string> {
  const query = new URLSearchParams({ dir: docDir(), name: file.name });
  const res = await fetch(`/api/upload?${query}`, { method: "POST", body: file });
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as { path: string }).path;
}

// Understand: an empty string removes the variable, so the theme's own CSS colour comes back.
const colourVars = (parsed: ParsedDoc, id: string) => ({
  "--accent": parsed.overrides.colors?.accent ?? themeById(id).defaults.colors.accent,
  "--text": parsed.overrides.colors?.text ?? "",
  "--muted": parsed.overrides.colors?.muted ?? "",
});

// The problem is the Document form and toolbar must reflect the YAML the moment it changes, not after the render debounce.
// The way we solve this is to re-parse the front matter synchronously on every edit (cheap) and resolve settings for the active theme.
// flow: Write tab — user types in editor or form -> onEdit() -> refreshParsed() <-- HERE
function refreshParsed() {
  const fileName = state.docPath?.split("/").pop() ?? null;
  const parsed = parseDoc(state.text, fileName);
  const theme = themeById(parsed.overrides.theme);
  Object.assign(state, { parsed, theme, settings: resolveSettings(parsed, theme.id, theme.defaults) });
}

// The problem is the user wants the paginated view ready the instant they flip to Preview, in whichever theme they pick.
// The way we solve this is to render the active theme first, then quietly pre-render the other themes while the browser is idle.
// flow: Write tab — user types -> scheduleRender() -> renderDoc() <-- HERE
// flow: Preview tab — user changes a toolbar control -> setSetting() -> renderDoc() <-- HERE
async function renderDoc() {
  const gen = ++generation;
  refreshParsed();
  const parsed = state.parsed!;
  const theme = state.theme;
  const bodyHtml = renderMarkdown(parsed.body, { docPath: state.docPath, typography: parsed.overrides.typography ?? true });
  const htmlFor = (t: Theme) => compose({ bodyHtml, settings: resolveSettings(parsed, t.id, t.defaults), themeCss: t.css });

  state.htmlFor = htmlFor;
  pool.setVars((id) => colourVars(parsed, id));
  pool.show(state.hoverTheme ?? theme.id);

  const activeHtml = htmlFor(theme);
  state.rendering = !pool.isReady(theme.id, activeHtml);
  draw();
  const result = await pool.render(theme.id, activeHtml);
  if (gen !== generation) return;
  state.rendering = false;
  state.error = result && "error" in result ? result.error : parsed.error;
  draw();
  prerenderOthers(gen);
}

// Understand: sequential and generation-checked, so a burst of typing never stacks up renders of stale text.
async function prerenderOthers(gen: number) {
  for (const t of THEMES) {
    if (t.id === state.theme.id) continue;
    await new Promise((r) => requestIdleCallback(r, { timeout: 2000 }));
    if (gen !== generation) return;
    await pool.render(t.id, state.htmlFor(t));
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderDoc, RENDER_DEBOUNCE_MS);
}

// flow: Write tab — user types -> createEditor onChange -> onEdit() <-- HERE
function onEdit(text: string) {
  state.text = text;
  if (!state.docPath) writeStored(DRAFT_KEY, text);
  refreshParsed();
  scheduleRender();
  draw();
}

// The problem is form and toolbar choices must be saved with the document, and the preview must react promptly.
// The way we solve this is to rewrite just the front matter in the editor (one undoable change); clicks render now, typing rides the debounce.
// flow: Preview tab — user changes a toolbar control -> setSetting() <-- HERE
// flow: Write tab — user fills in the Document form -> setSetting() <-- HERE
function setSetting(path: string[], value: unknown, opts?: { debounce: boolean }) {
  const edit = editFrontMatter(state.text, path, value);
  if ("error" in edit) {
    state.error = edit.error;
    return draw();
  }
  editor.dispatch({ changes: edit });
  if (opts?.debounce) return;
  clearTimeout(renderTimer);
  renderDoc();
}

// The problem is a picker opened near the right edge would hang off-screen and make the whole app scroll sideways.
// The way we solve this is to nudge the open panel left until it fits inside the window with a 12px gutter.
function keepPopoverOnScreen() {
  const pop = tools.querySelector<HTMLElement>(".pop");
  if (!pop) return;
  pop.style.left = "";
  const overflow = pop.getBoundingClientRect().right - (window.innerWidth - 12);
  if (overflow > 0) pop.style.left = `${-overflow}px`;
}

function setPopover(popover: Popover) {
  state.popover = popover;
  draw();
}

function setFontUi(ui: { target?: FontTarget; filter?: FontFilter }) {
  if (ui.target) state.fontTarget = ui.target;
  if (ui.filter) state.fontFilter = ui.filter;
  draw();
}

function setDetailsOpen(open: boolean) {
  if (state.detailsOpen === open) return;
  state.detailsOpen = open;
  writeStored(DETAILS_OPEN_KEY, open ? "1" : "0");
}

// The problem is the user wants to see a theme before committing to it.
// The way we solve this is to show the hovered theme's cached frame (rendering it now if needed) and fall back to the active one on leave.
// flow: Preview tab — user hovers a theme chip -> previewTheme() <-- HERE
function previewTheme(id: string | null) {
  state.hoverTheme = id;
  const target = id ?? state.theme.id;
  pool.show(target);
  const html = state.htmlFor(themeById(target));
  if (!pool.isReady(target, html)) pool.render(target, html).then(draw);
  draw();
}

// flow: Preview tab — user presses [ or ] -> cycleTheme() <-- HERE
function cycleTheme(step: number) {
  const i = THEMES.findIndex((t) => t.id === state.theme.id);
  setSetting(["theme"], THEMES[(i + step + THEMES.length) % THEMES.length].id);
}

// The problem is the editor and the page preview each need the full window to be usable.
// The way we solve this is GitHub-style tabs; the hidden pane stays laid out (just invisible) so background pagination still works.
// flow: Write/Preview tabs — user clicks a tab or presses ⌘↵ -> setTab() <-- HERE
function setTab(tab: Tab) {
  state.tab = tab;
  writePane.toggleAttribute("inert", tab !== "write");
  previewPane.toggleAttribute("inert", tab !== "preview");
  document.body.dataset.tab = tab;
  if (tab === "write") editor.focus();
  else {
    clearTimeout(renderTimer);
    renderDoc();
  }
  draw();
}

const toggleTab = () => setTab(state.tab === "write" ? "preview" : "write");

function statusText(result: RenderResult | null): string {
  if (state.rendering) return "Paginating…";
  return result && "pages" in result ? `${result.pages} page${result.pages === 1 ? "" : "s"}` : "";
}

// flow: any state change -> draw() <-- HERE
function draw() {
  const dirty = state.docPath && state.text !== state.savedText;
  const shown = state.hoverTheme ?? state.theme.id;
  const result = pool.resultOf(shown);
  render(
    html`
      <span class="brand">md2pdf</span>
      <span class="doc-title">${state.settings?.title ?? ""}</span>
      <span class="file" title=${state.docPath ? `Saving to ${state.docPath}` : "Not linked to a file — autosaved in this browser"}>
        ${state.docPath ?? "unsaved draft"}${dirty ? html`<span class="dirty">●</span>` : null}
      </span>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected=${state.tab === "write"} @click=${() => setTab("write")}>Write</button>
        <button role="tab" aria-selected=${state.tab === "preview"} @click=${() => setTab("preview")}>Preview</button>
      </div>
      <span class="hint">⌘↵ toggle${state.docPath ? " · ⌘S save" : ""}${state.tab === "preview" ? " · [ ] theme" : ""}</span>
      <span class="spacer"></span>
      <span class="status ${state.error ? "error" : ""}" title=${state.error ?? ""}>${state.error ?? statusText(result)}</span>
      <button class="primary" ?disabled=${!result || "error" in result} @click=${() => pool.print(state.settings?.title ?? "document")}>Export PDF</button>
    `,
    bar,
  );
  if (state.parsed && state.settings) {
    const { parsed, settings, theme } = state;
    render(
      toolbar({
        settings,
        overrides: parsed.overrides,
        theme,
        setSetting,
        previewTheme,
        popover: state.popover,
        setPopover,
        fontTarget: state.fontTarget,
        fontFilter: state.fontFilter,
        setFontUi,
      }),
      tools,
    );
    keepPopoverOnScreen();
    render(
      details({
        open: state.detailsOpen,
        overrides: parsed.overrides,
        settings,
        fallbackTitle: parsed.fallbackTitle,
        theme,
        error: parsed.error,
        setSetting,
        setOpen: setDetailsOpen,
      }),
      detailsHost,
    );
  }
}

// flow: app start — user opens http://localhost:4848 -> main() <-- HERE
async function main() {
  await loadSession();
  state.detailsOpen = readStored(DETAILS_OPEN_KEY) !== "0";
  refreshParsed();
  editor = createEditor(editorHost, state.text, { onChange: onEdit, onToggle: toggleTab, onSave: saveDoc, uploadImage });
  document.addEventListener("pointerdown", (e) => {
    if (state.popover && !(e.target as HTMLElement).closest?.(".pop-wrap")) setPopover(null);
  });
  // Clicks inside the preview iframe never reach this document, but they do take focus away from it.
  window.addEventListener("blur", () => state.popover && setPopover(null));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.popover) return setPopover(null);
    if (e.defaultPrevented) return;
    const typing = e.target instanceof HTMLElement && e.target.closest("input, select, textarea, .cm-editor");
    if (e.metaKey || e.ctrlKey) {
      if (e.key === "Enter") (e.preventDefault(), toggleTab());
      else if (e.key === "s") (e.preventDefault(), saveDoc());
    } else if (state.tab === "preview" && !typing && (e.key === "[" || e.key === "]")) {
      cycleTheme(e.key === "]" ? 1 : -1);
    }
  });
  setTab("write");
  renderDoc();
}

main();
