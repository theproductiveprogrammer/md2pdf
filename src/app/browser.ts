import { html, render } from "lit-html";

type Listing = { dirs: string[]; files: string[] };

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const dirUrl = (dir: string) => `/?dir=${encodeURIComponent(dir)}`;
const docUrl = (path: string) => `/?doc=${encodeURIComponent(path)}`;

// The problem is the user launches md2pdf on a folder of notes and wants to pick which file to work on.
// The way we solve this is a plain directory listing of subfolders and markdown files; every entry is an ordinary link,
// so Back works and ⌘-click opens a file in its own tab.
// flow: File browser — user opens md2pdf on a folder, or clicks the md2pdf logo in the editor -> showBrowser() <-- HERE
export async function showBrowser(dir: string, rootName: string, bar: HTMLElement, host: HTMLElement) {
  document.body.dataset.view = "browse";
  document.title = `${dir || rootName} — md2pdf`;
  const res = await fetch(`/api/list?dir=${encodeURIComponent(dir)}`);
  const listing: Listing | null = res.ok ? await res.json() : null;

  const parts = dir ? dir.split("/") : [];
  const crumbs = [html`<a href=${dirUrl("")}>${rootName}</a>`];
  parts.forEach((p, i) => crumbs.push(html`<span class="crumb-sep">/</span><a href=${dirUrl(parts.slice(0, i + 1).join("/"))}>${p}</a>`));

  render(
    html`
      <span class="brand">md2pdf</span>
      <nav class="crumbs">${crumbs}</nav>
      <span class="spacer"></span>
      <a class="primary" href="/?draft" title="An unsaved document, autosaved in this browser">Scratch pad</a>
    `,
    bar,
  );

  const empty = listing && !listing.dirs.length && !listing.files.length;
  render(
    html`
      <ul class="listing">
        ${dir ? html`<li><a class="dir" href=${dirUrl(parts.slice(0, -1).join("/"))}>..</a></li>` : null}
        ${listing?.dirs.map((d) => html`<li><a class="dir" href=${dirUrl(join(dir, d))}>${d}/</a></li>`)}
        ${listing?.files.map((f) => html`<li><a class="md" href=${docUrl(join(dir, f))}>${f}</a></li>`)}
      </ul>
      ${!listing ? html`<p class="note">This folder can't be read.</p>` : null}
      ${empty ? html`<p class="note">No markdown files here.</p>` : null}
    `,
    host,
  );
}
