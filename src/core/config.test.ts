import assert from "node:assert/strict";
import test from "node:test";
import { parseDoc, resolveSettings, type ThemeDefaults } from "./config.ts";

const theme: ThemeDefaults = {
  fonts: { body: "Inter", heading: "Inter", mono: "Inconsolata" },
  sizes: { body: "10pt", h1: "24pt", h2: "15pt", h3: "12pt" },
  colors: { text: "#000", muted: "#555", quote: "#333", accent: "#00f" },
};

const resolve = (front: string) => resolveSettings(parseDoc(`---\n${front}\n---\nhello`, null), "t", theme).sizes;

test("no sizes in front matter keeps the theme's sizes", () => {
  assert.deepEqual(resolve("title: x"), theme.sizes);
});

test("a bare number means points", () => {
  assert.equal(resolve("sizes:\n  body: 12").body, "12pt");
  assert.equal(resolve("sizes:\n  body: 11.5pt").body, "11.5pt");
});

test("headings the user did not set scale with the body", () => {
  assert.deepEqual(resolve("sizes:\n  body: 12"), { body: "12pt", h1: "28.8pt", h2: "18pt", h3: "14.4pt" });
});

test("a heading the user set is kept as written", () => {
  assert.deepEqual(resolve("sizes:\n  body: 12\n  h1: 20"), { body: "12pt", h1: "20pt", h2: "18pt", h3: "14.4pt" });
});

test("mixed units do not scale the headings", () => {
  assert.deepEqual(resolve("sizes:\n  body: 1.2em"), { body: "1.2em", h1: "24pt", h2: "15pt", h3: "12pt" });
});
