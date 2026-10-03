import { basicSetup, EditorView } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export interface EditorHooks {
  onChange: (text: string) => void;
  onToggle: () => void;
  onSave: () => void;
}

// The problem is the user types or pastes markdown and needs a comfortable editor that also owns our shortcuts.
// The way we solve this is CodeMirror with markdown highlighting, soft wrap, and ⌘↵ / ⌘S bound above the default keymap.
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
      markdown(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) hooks.onChange(u.state.doc.toString());
      }),
    ],
  });
}
