import { basicSetup, EditorView } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export interface EditorHooks {
  onChange: (text: string) => void;
  onToggle: () => void;
  onSave: () => void;
  uploadImage: (file: File) => Promise<string>;
}

const imagesIn = (list: DataTransfer | null) => [...(list?.files ?? [])].filter((f) => f.type.startsWith("image/"));

// The problem is a pasted screenshot arrives as "image.png", which says nothing about where it came from.
// The way we solve this is to name clipboard images paste-<timestamp> while keeping real filenames from drag-and-drop.
function uploadName(file: File, pasted: boolean): File {
  if (!pasted || file.name !== "image.png") return file;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return new File([file], `paste-${stamp}.${file.type.split("/")[1] ?? "png"}`, { type: file.type });
}

// The problem is the user wants to drop or paste an image straight into the document, like in GitHub.
// The way we solve this is to save each image next to the .md (via the server) and insert a relative ![](./assets/…) link where it landed.
// flow: Write tab — user drops/pastes an image -> insertImages() <-- HERE
async function insertImages(view: EditorView, files: File[], pos: number, hooks: EditorHooks) {
  const links: string[] = [];
  for (const file of files) {
    try {
      const src = await hooks.uploadImage(file);
      const alt = file.name.startsWith("paste-") ? "" : file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      links.push(`![${alt}](${encodeURI(src)})`);
    } catch (err) {
      links.push(`<!-- upload failed: ${file.name}: ${(err as Error).message} -->`);
    }
  }
  // Blank lines on both sides so each image is its own paragraph (and becomes a <figure>), never glued to adjacent text.
  const prev = view.state.sliceDoc(Math.max(0, pos - 2), pos);
  const before = pos === 0 || prev === "\n\n" ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
  const next = view.state.sliceDoc(pos, pos + 1);
  const insert = `${before}${links.join("\n\n")}${next && next !== "\n" ? "\n\n" : "\n"}`;
  view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
  view.focus();
}

// The problem is the user types or pastes markdown and needs a comfortable editor that also owns our shortcuts.
// The way we solve this is CodeMirror with markdown + YAML front-matter highlighting, soft wrap, image drop/paste, and ⌘↵ / ⌘S bound above the default keymap.
// Understand: basicSetup already binds Mod-Enter (insert blank line), so ours must be Prec.highest to win.
// flow: app start -> main() -> createEditor() <-- HERE
export function createEditor(parent: HTMLElement, doc: string, hooks: EditorHooks): EditorView {
  return new EditorView({
    parent,
    doc,
    extensions: [
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (hooks.onToggle(), true) },
          { key: "Mod-s", run: () => (hooks.onSave(), true), preventDefault: true },
        ]),
      ),
      basicSetup,
      yamlFrontmatter({ content: markdown() }),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        drop(event, view) {
          const files = imagesIn(event.dataTransfer);
          if (!files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
          insertImages(view, files, pos, hooks);
          return true;
        },
        paste(event, view) {
          const files = imagesIn(event.clipboardData).map((f) => uploadName(f, true));
          if (!files.length) return false;
          event.preventDefault();
          insertImages(view, files, view.state.selection.main.head, hooks);
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) hooks.onChange(u.state.doc.toString());
      }),
    ],
  });
}
