import { isCollection, isMap, isScalar, parse as parseYaml, parseDocument } from "yaml";

export interface Slots {
  left?: string;
  center?: string;
  right?: string;
  skipFirst?: boolean;
}

// Text: body + headings. Muted: captions, header/footer, labels. Quote: blockquotes. Accent: headings, links, table heads.
// Rules, code backgrounds and table stripes are mixed from these in base.css, so a palette recolours everything.
export interface Colors {
  text: string;
  muted: string;
  quote: string;
  accent: string;
}

// Type sizes in CSS units (pt). Body is the base; headings default to the theme's own, scaled if the body size changes.
export interface Sizes {
  body: string;
  h1: string;
  h2: string;
  h3: string;
}

export interface DocSettings {
  title: string;
  author: string;
  date: string;
  lang: string;
  theme: string;
  page: { size: string; margin: string };
  header: Slots | false;
  footer: Slots | false;
  breakBeforeH1: boolean;
  typography: boolean;
  fonts: { body: string; heading: string; mono: string };
  sizes: Sizes;
  colors: Colors;
  // Image for the {logo} placeholder: a path relative to the document, a URL, or a theme's built-in data URI. Null = none.
  logo: string | null;
}

// What a theme may preset; front matter always wins over these.
export interface ThemeDefaults {
  page?: Partial<DocSettings["page"]>;
  header?: Slots | false;
  footer?: Slots | false;
  breakBeforeH1?: boolean;
  fonts: DocSettings["fonts"];
  sizes: Sizes;
  colors: Colors;
  // Built-in logo (data URI) for the {logo} placeholder; the document's own `logo:` setting replaces it.
  logo?: string;
}

// Only the keys the user actually wrote in front matter.
export interface Overrides {
  title?: string;
  author?: string;
  date?: string;
  lang?: string;
  theme?: string;
  page?: Partial<DocSettings["page"]>;
  header?: Slots | false;
  footer?: Slots | false;
  breakBeforeH1?: boolean;
  typography?: boolean;
  fonts?: Partial<DocSettings["fonts"]>;
  sizes?: Partial<Sizes>;
  colors?: Partial<DocSettings["colors"]>;
  logo?: string;
}

export interface ParsedDoc {
  overrides: Overrides;
  body: string;
  fallbackTitle: string;
  error: string | null;
}

const LEADING_KEYS = ["title", "author", "date", "logo"];

export const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const formatDate = (d: Date, lang: string) => d.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });

const pick = <T extends object>(v: unknown, keys: (keyof T)[]): Partial<T> | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const out: Partial<T> = {};
  for (const k of keys) {
    const val = (v as Record<string, unknown>)[k as string];
    if (val != null) (out as Record<string, unknown>)[k as string] = String(val);
  }
  return out;
};

// A bare number in YAML (`body: 11`) means points; anything else is taken as a CSS length.
const sizes = (v: unknown): Partial<Sizes> | undefined => {
  const out = pick<Sizes>(v, ["body", "h1", "h2", "h3"]);
  if (!out) return undefined;
  for (const k of Object.keys(out) as (keyof Sizes)[]) if (/^\d+(\.\d+)?$/.test(out[k]!)) out[k] = `${out[k]}pt`;
  return out;
};

const pt = (v: string) => parseFloat(v);

// The problem is a user who bumps the body size expects the headings to grow with it, not stay at the theme's fixed points.
// The way we solve this is to scale each heading the user didn't set by the ratio of the new body size to the theme's.
// Understand: only when both sizes are in the same unit can we scale; mixed units fall back to the theme's heading size.
function resolveSizes(theme: Sizes, o: Partial<Sizes> | undefined): Sizes {
  const body = o?.body ?? theme.body;
  const unit = (v: string) => v.replace(/^[\d.]+/, "");
  const ratio = unit(body) === unit(theme.body) && pt(theme.body) > 0 ? pt(body) / pt(theme.body) : 1;
  const scaled = (k: "h1" | "h2" | "h3") => o?.[k] ?? (ratio === 1 ? theme[k] : `${+(pt(theme[k]) * ratio).toFixed(1)}${unit(theme[k])}`);
  return { body, h1: scaled("h1"), h2: scaled("h2"), h3: scaled("h3") };
}

const slots = (v: unknown): Slots | false | undefined => (v === false ? false : v && typeof v === "object" ? (v as Slots) : undefined);

// The problem is the user configures theme, fonts, page size and header/footer by writing YAML at the top of the markdown.
// The way we solve this is to split off the YAML and keep only what the user set, reporting bad YAML without blocking the preview.
// flow: Preview tab — user switches to Preview -> renderDoc() -> parseDoc() <-- HERE
export function parseDoc(source: string, fileName: string | null): ParsedDoc {
  const match = source.match(FRONT_MATTER);
  const body = match ? source.slice(match[0].length) : source;
  const fallbackTitle = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? fileName?.replace(/\.md$/i, "") ?? "Untitled";
  if (!match) return { overrides: {}, body, fallbackTitle, error: null };

  let meta: Record<string, unknown>;
  try {
    meta = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
    if (typeof meta !== "object") throw new Error("expected key: value pairs");
  } catch (err) {
    return { overrides: {}, body, fallbackTitle, error: `Front matter: ${(err as Error).message}` };
  }

  const str = (v: unknown) => (v == null ? undefined : String(v));
  const lang = str(meta.lang);
  return {
    body,
    fallbackTitle,
    error: null,
    overrides: {
      title: str(meta.title),
      author: str(meta.author),
      date: meta.date instanceof Date ? formatDate(meta.date, lang ?? "en") : str(meta.date),
      lang,
      theme: str(meta.theme),
      page: pick(meta.page, ["size", "margin"]),
      header: slots(meta.header),
      footer: slots(meta.footer),
      breakBeforeH1: typeof meta.breakBeforeH1 === "boolean" ? meta.breakBeforeH1 : undefined,
      typography: typeof meta.typography === "boolean" ? meta.typography : undefined,
      fonts: pick(meta.fonts, ["body", "heading", "mono"]),
      sizes: sizes(meta.sizes),
      colors: pick(meta.colors, ["text", "muted", "quote", "accent"]),
      logo: str(meta.logo),
    },
  };
}

// The problem is the same document must look right under every theme, each with its own fonts, margins and footer.
// The way we solve this is a three-layer merge: built-in defaults, then the theme's presets, then whatever the user wrote.
// flow: Preview tab — renderDoc() -> composeFor(theme) -> resolveSettings() <-- HERE
// flow: Preview tab — user opens the toolbar -> drawTools() -> resolveSettings() <-- HERE
export function resolveSettings(parsed: ParsedDoc, themeId: string, theme: ThemeDefaults): DocSettings {
  const o = parsed.overrides;
  const lang = o.lang ?? "en";
  return {
    title: o.title ?? parsed.fallbackTitle,
    author: o.author ?? "",
    date: o.date ?? formatDate(new Date(), lang),
    lang,
    theme: themeId,
    page: { size: "A4", margin: "20mm", ...theme.page, ...o.page },
    header: o.header ?? theme.header ?? false,
    footer: o.footer ?? theme.footer ?? { center: "{page} / {pages}" },
    breakBeforeH1: o.breakBeforeH1 ?? theme.breakBeforeH1 ?? false,
    typography: o.typography ?? true,
    fonts: { ...theme.fonts, ...o.fonts },
    sizes: resolveSizes(theme.sizes, o.sizes),
    colors: { ...theme.colors, ...o.colors },
    logo: o.logo || theme.logo || null,
  };
}

// The problem is toolbar changes (theme, size, fonts…) must land in the markdown itself so they're saved with the doc.
// The way we solve this is to edit the YAML in place with the yaml Document API, which keeps the user's comments and layout.
// Understand: returns only the front-matter range to replace, so the editor keeps cursor position and undo history for the body.
// flow: Preview tab — user changes a toolbar control -> setSetting() -> editFrontMatter() <-- HERE
export function editFrontMatter(source: string, path: string[], value: unknown): { from: number; to: number; insert: string } | { error: string } {
  const match = source.match(FRONT_MATTER);
  const doc = parseDocument(match ? match[1] : "");
  if (doc.errors.length) return { error: `Fix the front matter first: ${doc.errors[0].message}` };
  if (value === undefined) {
    doc.deleteIn(path);
    // Prune parents the delete left empty, e.g. `colors: {}` after resetting the accent.
    for (let depth = path.length - 1; depth > 0; depth--) {
      const parent = doc.getIn(path.slice(0, depth), true);
      if (isCollection(parent) && parent.items.length === 0) doc.deleteIn(path.slice(0, depth));
    }
  } else if (path.length === 1 && LEADING_KEYS.includes(path[0]) && isMap(doc.contents) && !doc.has(path[0])) {
    // New title/author/date go at the top in a fixed order, so clearing and retyping a field doesn't shuffle the YAML.
    const rank = LEADING_KEYS.indexOf(path[0]);
    const items = doc.contents.items;
    const rankOf = (i: number) => LEADING_KEYS.indexOf(String(isScalar(items[i].key) ? items[i].key.value : items[i].key));
    let at = 0;
    while (at < items.length && rankOf(at) !== -1 && rankOf(at) < rank) at++;
    items.splice(at, 0, doc.createPair(path[0], value));
  } else doc.setIn(path, value);
  const empty = doc.contents == null || (isCollection(doc.contents) && doc.contents.items.length === 0);
  const yaml = empty ? "" : doc.toString().trimEnd();
  const insert = yaml ? `---\n${yaml}\n---\n` : "";
  return { from: 0, to: match ? match[0].length : 0, insert: match || !yaml ? insert : `${insert}\n` };
}
