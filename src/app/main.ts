import { html, render } from "lit-html";
import type { EditorView } from "codemirror";
import { parseDoc } from "../core/config.ts";
import { renderMarkdown } from "../core/markdown.ts";
import { compose } from "../core/compose.ts";
import { createEditor } from "./editor.ts";
import { exportPdf, renderPreview } from "./preview.ts";
import themeCss from "../themes/modern.css?raw";
import sample from "../../examples/welcome.md?raw";

type Tab = "write" | "preview";

const DRAFT_KEY = "md2pdf:draft";
const RENDER_DEBOUNCE_MS = 400;

const state = {
  docPath: null as string | null,
  text: "",
  savedText: "",
  tab: "write" as Tab,
  pages: 0,
  rendering: false,
  error: null as string | null,
  renderedText: null as string | null,
  title: "Untitled",
};

const bar = document.getElementById("bar")!;
const writePane = document.getElementById("write")!;
const previewPane = document.getElementById("preview")!;
let editor: EditorView;
let renderTimer: number | undefined;

function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function writeDraft(text: string) {
  try {
    localStorage.setItem(DRAFT_KEY, text);
  } catch {
    // Private windows can refuse storage; the draft just won't survive a reload.
  }
}

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
    state.text = readDraft() ?? sample;
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
  drawBar();
}

// The problem is the user wants the paginated PDF view to be ready the instant they flip to Preview.
// The way we solve this is to re-render in the background shortly after typing stops, skipping work if nothing changed.
// flow: Write tab — user types -> scheduleRender() -> renderDoc() <-- HERE
// flow: Preview tab — user presses ⌘↵ -> setTab() -> renderDoc() <-- HERE
async function renderDoc() {
  if (state.text === state.renderedText) return;
  const text = state.text;
  state.renderedText = text;
  state.rendering = true;
  drawBar();

  const fileName = state.docPath?.split("/").pop() ?? null;
  const parsed = parseDoc(text, fileName);
  const bodyHtml = renderMarkdown(parsed.body, { docPath: state.docPath, typography: parsed.config.typography });
  state.title = parsed.config.title;

  const result = await renderPreview(previewPane, (renderId) => compose({ bodyHtml, config: parsed.config, themeCss, renderId }));
  if (!result) return;
  state.rendering = false;
  state.error = "error" in result ? result.error : parsed.error;
  if ("pages" in result) state.pages = result.pages;
  drawBar();
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderDoc, RENDER_DEBOUNCE_MS);
}

// flow: Write tab — user types -> createEditor onChange -> onEdit() <-- HERE
function onEdit(text: string) {
  state.text = text;
  if (!state.docPath) writeDraft(text);
  scheduleRender();
  drawBar();
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
  drawBar();
}

const toggleTab = () => setTab(state.tab === "write" ? "preview" : "write");

function statusText(): string {
  if (state.rendering) return "Paginating…";
  return state.pages ? `${state.pages} page${state.pages === 1 ? "" : "s"}` : "";
}

// flow: any state change -> drawBar() <-- HERE
function drawBar() {
  const dirty = state.docPath && state.text !== state.savedText;
  render(
    html`
      <span class="brand">md2pdf</span>
      <span class="file" title=${state.docPath ?? "Scratch pad (saved in this browser)"}>
        ${state.docPath ?? "Scratch pad"}${dirty ? html`<span class="dirty">●</span>` : null}
      </span>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected=${state.tab === "write"} @click=${() => setTab("write")}>Write</button>
        <button role="tab" aria-selected=${state.tab === "preview"} @click=${() => setTab("preview")}>Preview</button>
      </div>
      <span class="hint">⌘↵ toggle${state.docPath ? " · ⌘S save" : ""}</span>
      <span class="spacer"></span>
      <span class="status ${state.error ? "error" : ""}" title=${state.error ?? ""}>${state.error ?? statusText()}</span>
      <button class="primary" ?disabled=${!state.pages} @click=${() => exportPdf(previewPane, state.title)}>Export PDF</button>
    `,
    bar,
  );
}

// flow: app start — user opens http://localhost:4848 -> main() <-- HERE
async function main() {
  await loadSession();
  editor = createEditor(writePane, state.text, { onChange: onEdit, onToggle: toggleTab, onSave: saveDoc });
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
    if (e.key === "Enter") (e.preventDefault(), toggleTab());
    else if (e.key === "s") (e.preventDefault(), saveDoc());
  });
  setTab("write");
  renderDoc();
}

main();
