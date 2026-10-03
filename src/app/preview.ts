export type RenderResult = { pages: number } | { error: string };

let latestRenderId = 0;

// The problem is re-paginating takes a moment, and showing a half-laid-out page makes the preview flicker.
// The way we solve this is to paginate in a hidden iframe and only swap it in once Paged.js reports it's done; stale renders are dropped.
// flow: Preview tab — user presses ⌘↵ -> showPreview() -> renderPreview() <-- HERE
export function renderPreview(host: HTMLElement, buildHtml: (renderId: number) => string): Promise<RenderResult | null> {
  const renderId = ++latestRenderId;
  const frame = document.createElement("iframe");
  frame.className = "pending";
  frame.title = "PDF preview";

  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.renderId !== renderId) return;
      window.removeEventListener("message", onMessage);
      if (renderId !== latestRenderId) {
        frame.remove();
        return resolve(null);
      }
      for (const old of host.querySelectorAll("iframe")) if (old !== frame) old.remove();
      frame.classList.remove("pending");
      resolve(e.data.type === "md2pdf:error" ? { error: e.data.message } : { pages: e.data.pages });
    };
    window.addEventListener("message", onMessage);
    frame.srcdoc = buildHtml(renderId);
    host.appendChild(frame);
  });
}

// The problem is the user wants a PDF file of exactly what the preview shows.
// The way we solve this is to print the paginated preview iframe; the browser's "Save as PDF" destination writes the file.
// Understand: Chrome names the saved PDF after the top-level document title, so we borrow the doc title for the duration of the dialog.
// flow: Preview tab — user clicks Export -> exportPdf() <-- HERE
export function exportPdf(host: HTMLElement, title: string) {
  const frame = host.querySelector<HTMLIFrameElement>("iframe:not(.pending)");
  if (!frame?.contentWindow) return;
  const previous = document.title;
  document.title = title;
  frame.contentWindow.print();
  document.title = previous;
}
