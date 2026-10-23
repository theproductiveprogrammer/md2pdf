import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "./markdown.ts";

const formula = String.raw`S_{\text{node}} = \frac{\sum_{i \in E} w_i a_i f_i} {\sum_{i \in E} w_i} \times 100`;
const render = (source: string, typography = true) => renderMarkdown(source, { docPath: null, typography });

test("renders the node score as display math on one line or multiple lines", () => {
  for (const typography of [true, false]) {
    for (const source of [`$$${formula}$$`, `$$\n${formula}\n$$`]) {
      const html = render(source, typography);
      assert.match(html, /class="katex-display"/);
      assert.match(html, /<math /);
      assert.match(html, /class="mfrac"/);
      assert.doesNotMatch(html, /katex-error/);
      assert.ok(html.includes(formula));
    }
  }
});

test("renders inline math without changing its TeX through smart typography", () => {
  const html = render(String.raw`The ratio is $\frac{1}{2} + x'$ today.`);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /katex-display|katex-error/);
  assert.ok(html.includes(String.raw`\frac{1}{2} + x&#x27;`));
});

test("leaves math in code, escaped dollars and ordinary currency alone", () => {
  for (const source of ["`$x$`", "```tex\n$$x$$\n```", String.raw`\$x\$`, "Prices are $5 and $10."]) {
    assert.doesNotMatch(render(source), /class="katex/);
  }
});

test("invalid TeX does not prevent the rest of the document from rendering", () => {
  const html = render(String.raw`$\notARealCommand{x}$` + "\n\nFollowing paragraph.");
  assert.match(html, /Following/);
  assert.ok(html.includes(String.raw`\notARealCommand`));
});

test("keeps short code blocks whole but lets long ones split across pages", () => {
  const block = (n: number) => "```\n" + Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n```";
  assert.match(render(block(20)), /^<pre class="keep-together"><code>/);
  assert.match(render("```js\nconst x = 1;\n```"), /^<pre class="keep-together"><code class="language-js">/);
  assert.match(render("    indented code"), /^<pre class="keep-together">/);
  assert.match(render(block(21)), /^<pre><code>/);
});
