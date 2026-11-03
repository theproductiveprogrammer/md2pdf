// Folder part of a root-relative doc path, with trailing slash ("notes/a.md" -> "notes/", "a.md" -> "").
export const docDirOf = (docPath: string | null) => (docPath?.includes("/") ? docPath.slice(0, docPath.lastIndexOf("/") + 1) : "");

// A link that leaves the user's folder: https:, mailto:, protocol-relative //host, etc.
export const isExternal = (href: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href);

// The problem is `./other.md` in a document means "next to this .md file", but the preview has no idea where that is on disk.
// The way we solve this is to turn it into a path relative to the folder md2pdf was launched on; a leading / means that folder itself.
// Understand: returns null for in-page (#…) and external links, which need no resolving; the #fragment is kept.
export function resolveLocal(href: string, docPath: string | null): string | null {
  if (!href || href.startsWith("#") || isExternal(href)) return null;
  const url = new URL(href, `http://x/${docDirOf(docPath)}`);
  return decodeURIComponent(url.pathname.slice(1)) + url.hash;
}

// The problem is clicking a link to a local file should open something useful, not a 404 or a copy of the app.
// The way we solve this is markdown opens in a new md2pdf editor, folders open in the file browser, anything else is served raw.
// flow: Preview tab — user clicks a link to a local file -> followLink() -> appUrlFor() <-- HERE
export function appUrlFor(local: string): string {
  const hashAt = local.indexOf("#");
  const path = hashAt < 0 ? local : local.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : local.slice(hashAt);
  if (/\.(md|markdown)$/i.test(path)) return `/?doc=${encodeURIComponent(path)}${hash}`;
  if (path === "" || path.endsWith("/")) return `/?dir=${encodeURIComponent(path.replace(/\/$/, ""))}`;
  return "/files/" + path.split("/").map(encodeURIComponent).join("/") + hash;
}

// The problem is a table of contents written as [Intro](#1-intro) only works if headings carry matching ids.
// The way we solve this is GitHub's slug rule: lowercase, drop punctuation, spaces become hyphens.
export const slugify = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
