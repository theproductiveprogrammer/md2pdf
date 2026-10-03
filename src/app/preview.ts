export type RenderResult = { pages: number } | { error: string };

interface Slot {
  frame: HTMLIFrameElement | null;
  html: string | null;
  result: RenderResult | null;
  pending: { html: string; promise: Promise<RenderResult | null> } | null;
}

// The problem is the user wants to flip between themes and see the paginated result instantly, not after a re-layout.
// The way we solve this is one iframe per theme, each cached by the exact HTML it rendered; switching just changes which one is visible.
// Understand: hidden frames use visibility:hidden (not display:none) because Paged.js needs real layout to measure pages.
export class PreviewPool {
  private slots = new Map<string, Slot>();
  private shownId: string | null = null;
  private varsFor: (id: string) => Record<string, string> = () => ({});

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  private slot(id: string): Slot {
    let s = this.slots.get(id);
    if (!s) this.slots.set(id, (s = { frame: null, html: null, result: null, pending: null }));
    return s;
  }

  isReady(id: string, html: string): boolean {
    const s = this.slots.get(id);
    return !!s?.frame && s.html === html;
  }

  resultOf(id: string): RenderResult | null {
    return this.slots.get(id)?.result ?? null;
  }

  // The problem is re-paginating takes a moment, and showing a half-laid-out page makes the preview flicker.
  // The way we solve this is to paginate in a fresh hidden frame and swap it in only when Paged.js reports done; superseded renders are dropped.
  // flow: Preview tab — renderDoc() -> pool.render(active theme) <-- HERE
  // flow: Write tab — user stops typing -> renderDoc() -> prerenderOthers() -> pool.render(other theme) <-- HERE
  render(id: string, html: string): Promise<RenderResult | null> {
    const s = this.slot(id);
    if (s.frame && s.html === html) return Promise.resolve(s.result);
    if (s.pending?.html === html) return s.pending.promise;

    const frame = document.createElement("iframe");
    frame.title = "PDF preview";
    const promise = new Promise<RenderResult | null>((resolve) => {
      const onMessage = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow) return;
        window.removeEventListener("message", onMessage);
        if (s.pending?.html !== html) {
          frame.remove();
          return resolve(null);
        }
        const result: RenderResult = e.data.type === "md2pdf:error" ? { error: e.data.message } : { pages: e.data.pages };
        const old = s.frame;
        Object.assign(s, { frame, html, result, pending: null });
        this.applyVarsTo(id, frame);
        if (this.shownId === id) this.reveal(frame);
        old?.remove();
        resolve(result);
      };
      window.addEventListener("message", onMessage);
    });
    s.pending = { html, promise };
    frame.srcdoc = html;
    this.host.appendChild(frame);
    return promise;
  }

  // flow: Preview tab — user clicks/hovers a theme chip -> pool.show() <-- HERE
  // Understand: if the theme's frame isn't rendered yet, the current frame stays up until it is (render() reveals it on arrival).
  show(id: string) {
    this.shownId = id;
    const next = this.slots.get(id)?.frame;
    if (next) this.reveal(next);
  }

  // The problem is exactly one frame may be visible — two stacked frames show the wrong theme and Export prints the wrong one.
  // The way we solve this is to hide every other frame on each reveal, carrying the reader's relative scroll position across.
  private reveal(next: HTMLIFrameElement) {
    const prev = this.host.querySelector<HTMLIFrameElement>("iframe.shown");
    const p = prev?.contentWindow;
    const n = next.contentWindow;
    if (prev && prev !== next && p && n) {
      const ratio = p.scrollY / Math.max(1, p.document.documentElement.scrollHeight - p.innerHeight);
      n.scrollTo(0, ratio * (n.document.documentElement.scrollHeight - n.innerHeight));
    }
    for (const f of this.host.querySelectorAll("iframe.shown")) if (f !== next) f.classList.remove("shown");
    next.classList.add("shown");
  }

  // The problem is recolouring (e.g. the accent picker) should feel instant and not re-paginate anything.
  // The way we solve this is to set CSS variables on every cached frame's root element directly.
  // flow: Preview tab — user drags the accent colour picker -> setSetting() -> renderDoc() -> pool.setVars() <-- HERE
  // Understand: vars are per theme (each theme has its own default accent), hence a function of the theme id.
  setVars(varsFor: (id: string) => Record<string, string>) {
    this.varsFor = varsFor;
    for (const [id, s] of this.slots) if (s.frame) this.applyVarsTo(id, s.frame);
  }

  private applyVarsTo(id: string, frame: HTMLIFrameElement) {
    const root = frame.contentDocument?.documentElement;
    if (!root) return;
    for (const [k, v] of Object.entries(this.varsFor(id))) {
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
  }

  // The problem is the user wants a PDF file of exactly what the preview shows.
  // The way we solve this is to print the visible frame; the browser's "Save as PDF" destination writes the file.
  // Understand: Chrome names the saved PDF after the top-level document title, so we borrow the doc title for the dialog.
  // flow: Preview tab — user clicks Export -> pool.print() <-- HERE
  print(title: string) {
    const frame = this.shownId ? this.slots.get(this.shownId)?.frame : null;
    if (!frame?.contentWindow) return;
    const previous = document.title;
    document.title = title;
    frame.contentWindow.print();
    document.title = previous;
  }
}
