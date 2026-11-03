import assert from "node:assert/strict";
import test from "node:test";
import { appUrlFor, resolveLocal, slugify } from "./links.ts";
import { renderMarkdown } from "./markdown.ts";

test("slugs headings the way GitHub does", () => {
  assert.equal(slugify("1. The whole office"), "1-the-whole-office");
  assert.equal(slugify("How the jobs move"), "how-the-jobs-move");
  assert.equal(slugify("What’s new? (2026)"), "whats-new-2026");
  assert.equal(slugify("Café & crème"), "café--crème");
});

test("gives headings ids, numbering repeats and keeping explicit ids", () => {
  const html = renderMarkdown("## 1. The whole office\n\n## Notes\n\n## Notes\n\n## Mine {#custom}\n\n## `code` here", {
    docPath: null,
    typography: true,
  });
  assert.match(html, /<h2 id="1-the-whole-office">/);
  assert.match(html, /<h2 id="notes">Notes/);
  assert.match(html, /<h2 id="notes-1">Notes/);
  assert.match(html, /<h2 id="custom">/);
  assert.match(html, /<h2 id="code-here">/);
});

test("keeps in-page and external links as real links", () => {
  const html = renderMarkdown("[a](#1-intro) [b](https://example.com) [c](mailto:x@y.z)", { docPath: "notes/a.md", typography: false });
  assert.match(html, /href="#1-intro"/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /href="mailto:x@y.z"/);
  assert.doesNotMatch(html, /data-local/);
});

test("turns local file links into data-local paths relative to the launch folder", () => {
  const html = renderMarkdown("[a](./other.md#part) [b](../pic%20one.png) [c](/top.md)", { docPath: "notes/a.md", typography: false });
  assert.match(html, /<a data-local="notes\/other.md#part">a<\/a>/);
  assert.match(html, /<a data-local="pic one.png">b<\/a>/);
  assert.match(html, /<a data-local="top.md">c<\/a>/);
  assert.doesNotMatch(html, /href=/);
});

test("resolves only local links", () => {
  assert.equal(resolveLocal("#x", "a.md"), null);
  assert.equal(resolveLocal("https://x.com", "a.md"), null);
  assert.equal(resolveLocal("//x.com/a", "a.md"), null);
  assert.equal(resolveLocal("sub/b.md", "a.md"), "sub/b.md");
  assert.equal(resolveLocal("b.md", null), "b.md");
});

test("opens markdown in the editor, folders in the browser and other files raw", () => {
  assert.equal(appUrlFor("notes/other.md#part"), "/?doc=notes%2Fother.md#part");
  assert.equal(appUrlFor("notes/"), "/?dir=notes");
  assert.equal(appUrlFor(""), "/?dir=");
  assert.equal(appUrlFor("sub folder/pic.png"), "/files/sub%20folder/pic.png");
});
