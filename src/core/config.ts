import { parse as parseYaml } from "yaml";

export interface Slots {
  left?: string;
  center?: string;
  right?: string;
  skipFirst?: boolean;
}

export interface DocConfig {
  title: string;
  author: string;
  date: string;
  lang: string;
  page: { size: string; margin: string };
  header: Slots | false;
  footer: Slots | false;
  breakBeforeH1: boolean;
  typography: boolean;
}

export interface ParsedDoc {
  config: DocConfig;
  body: string;
  error: string | null;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// The problem is a document with no front matter should still print nicely, with a sensible title and page numbers.
// The way we solve this is to fill every setting with a default, deriving the title from the first H1 or the file name.
function defaults(body: string, fileName: string | null): DocConfig {
  const h1 = body.match(/^#\s+(.+)$/m)?.[1].trim();
  const lang = "en";
  return {
    title: h1 ?? fileName?.replace(/\.md$/i, "") ?? "Untitled",
    author: "",
    date: new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" }),
    lang,
    page: { size: "A4", margin: "20mm 18mm" },
    header: false,
    footer: { center: "{page} / {pages}" },
    breakBeforeH1: false,
    typography: true,
  };
}

// The problem is the user configures fonts, page size and header/footer per document by writing YAML at the top of the markdown.
// The way we solve this is to split off the YAML, merge it over the defaults, and report bad YAML without blocking the preview.
// flow: Preview tab — user switches to Preview -> renderDoc() -> parseDoc() <-- HERE
export function parseDoc(source: string, fileName: string | null): ParsedDoc {
  const match = source.match(FRONT_MATTER);
  const body = match ? source.slice(match[0].length) : source;
  const config = defaults(body, fileName);
  if (!match) return { config, body, error: null };

  let meta: Record<string, unknown>;
  try {
    meta = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { config, body, error: `Front matter: ${(err as Error).message}` };
  }

  const str = (v: unknown, fallback: string) => (v == null ? fallback : String(v));
  const slots = (v: unknown, fallback: Slots | false): Slots | false =>
    v === false ? false : v && typeof v === "object" ? (v as Slots) : fallback;
  const page = (meta.page ?? {}) as Record<string, unknown>;

  return {
    body,
    error: null,
    config: {
      title: str(meta.title, config.title),
      author: str(meta.author, config.author),
      date: meta.date instanceof Date ? meta.date.toLocaleDateString(str(meta.lang, "en"), { year: "numeric", month: "long", day: "numeric" }) : str(meta.date, config.date),
      lang: str(meta.lang, config.lang),
      page: { size: str(page.size, config.page.size), margin: str(page.margin, config.page.margin) },
      header: slots(meta.header, config.header),
      footer: slots(meta.footer, config.footer),
      breakBeforeH1: meta.breakBeforeH1 === true,
      typography: meta.typography !== false,
    },
  };
}
