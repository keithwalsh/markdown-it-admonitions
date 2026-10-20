import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

import admonitionPlugin, { type AdmonitionPluginOptions } from "../src/index.js";

const render = (src: string, options?: AdmonitionPluginOptions): string =>
  new MarkdownIt().use(admonitionPlugin, options).render(src);

const admonition = (type: string, title: string, content: string, icon = ""): string =>
  `<div class="admonition admonition-${type}">\n` +
  `<div class="admonition-title">${icon}${title}</div>\n` +
  `<div class="admonition-content">\n${content}</div>\n` +
  `</div>\n`;

const emoji = (icon: string): string => `<span class="admonition-icon">${icon}</span>`;

describe("docusaurus syntax", () => {
  it("renders an admonition with the default title and icon", () => {
    expect(render("::: note\nBody\n:::")).toBe(
      admonition("note", "Note", "<p>Body</p>\n", emoji("📝")),
    );
  });

  it("uses the text after the type as the title", () => {
    expect(render("::: warning Mind the gap\nBody\n:::")).toBe(
      admonition("warning", "Mind the gap", "<p>Body</p>\n", emoji("⚠️")),
    );
  });

  it("accepts the type directly after the marker", () => {
    expect(render(":::tip\nBody\n:::")).toBe(
      admonition("tip", "Tip", "<p>Body</p>\n", emoji("💡")),
    );
  });

  it("renders every default type", () => {
    for (const type of ["note", "tip", "warning", "danger", "info", "success", "question"]) {
      expect(render(`::: ${type}\nBody\n:::`)).toContain(`class="admonition admonition-${type}"`);
    }
  });

  it("leaves unknown types as text", () => {
    expect(render("::: unknown\nBody\n:::")).toBe("<p>::: unknown\nBody\n:::</p>\n");
  });

  it("escapes HTML in the title", () => {
    expect(render("::: note <b>Bold</b>\nBody\n:::")).toContain(
      "&lt;b&gt;Bold&lt;/b&gt;</div>",
    );
  });

  it("renders block content inside the admonition", () => {
    expect(render("::: note\n- a\n  - b\n\n```js\nx\n```\n:::")).toBe(
      admonition(
        "note",
        "Note",
        "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n" +
          '<pre><code class="language-js">x\n</code></pre>\n',
        emoji("📝"),
      ),
    );
  });

  it("nests admonitions with longer outer fences", () => {
    expect(render(":::: note Outer\n::: tip Inner\nBody\n:::\n::::")).toBe(
      admonition(
        "note",
        "Outer",
        admonition("tip", "Inner", "<p>Body</p>\n", emoji("💡")),
        emoji("📝"),
      ),
    );
  });

  it("renders inside list items", () => {
    expect(render("- item\n\n  ::: note\n  Body\n  :::")).toBe(
      "<ul>\n<li>\n<p>item</p>\n" +
        admonition("note", "Note", "<p>Body</p>\n", emoji("📝")) +
        "</li>\n</ul>\n",
    );
  });

  it("runs to the end of the document without a closing fence", () => {
    expect(render("::: note\nBody")).toBe(
      admonition("note", "Note", "<p>Body</p>\n", emoji("📝")),
    );
  });

  it("supports a custom marker", () => {
    expect(render("!!! note\nBody\n!!!", { marker: "!" })).toBe(
      admonition("note", "Note", "<p>Body</p>\n", emoji("📝")),
    );
  });

  it("is disabled by docusaurusStyle: false", () => {
    expect(render("::: note\nBody\n:::", { docusaurusStyle: false })).toBe(
      "<p>::: note\nBody\n:::</p>\n",
    );
  });
});

describe("obsidian syntax", () => {
  it("renders a callout with the default title and icon", () => {
    expect(render("> [!note]\n> Body")).toBe(
      admonition("note", "Note", "<p>Body</p>\n", emoji("📝")),
    );
  });

  it("uses the text after the type as the title", () => {
    expect(render("> [!warning] Mind the gap\n> Body")).toBe(
      admonition("warning", "Mind the gap", "<p>Body</p>\n", emoji("⚠️")),
    );
  });

  it("matches the type case-insensitively", () => {
    expect(render("> [!TIP]\n> Body")).toBe(
      admonition("tip", "Tip", "<p>Body</p>\n", emoji("💡")),
    );
  });

  it("leaves unknown types as blockquotes", () => {
    expect(render("> [!unknown]\n> Body")).toBe(
      "<blockquote>\n<p>[!unknown]\nBody</p>\n</blockquote>\n",
    );
  });

  it("leaves plain blockquotes alone", () => {
    expect(render("> Quote")).toBe("<blockquote>\n<p>Quote</p>\n</blockquote>\n");
  });

  it("renders multiple paragraphs", () => {
    expect(render("> [!note]\n> One\n>\n> Two")).toBe(
      admonition("note", "Note", "<p>One</p>\n<p>Two</p>\n", emoji("📝")),
    );
  });

  it("renders fenced code", () => {
    expect(render("> [!tip]\n> ```js\n> x\n> ```")).toBe(
      admonition("tip", "Tip", '<pre><code class="language-js">x\n</code></pre>\n', emoji("💡")),
    );
  });

  it("nests callouts", () => {
    expect(render("> [!note] Outer\n> > [!tip] Inner\n> > Body")).toBe(
      admonition(
        "note",
        "Outer",
        admonition("tip", "Inner", "<p>Body</p>\n", emoji("💡")),
        emoji("📝"),
      ),
    );
  });

  it("ends at the next non-quoted block", () => {
    expect(render("> [!note]\n> Body\n\n> Quote")).toBe(
      admonition("note", "Note", "<p>Body</p>\n", emoji("📝")) +
        "<blockquote>\n<p>Quote</p>\n</blockquote>\n",
    );
  });

  it("is disabled by obsidianStyle: false", () => {
    expect(render("> [!note]\n> Body", { obsidianStyle: false })).toBe(
      "<blockquote>\n<p>[!note]\nBody</p>\n</blockquote>\n",
    );
  });
});

describe("options", () => {
  it("registers custom types", () => {
    expect(render("::: custom\nBody\n:::", { types: ["custom"] })).toBe(
      admonition("custom", "Custom", "<p>Body</p>\n"),
    );
  });

  it("overrides emoji icons", () => {
    expect(render("::: note\nBody\n:::", { icons: { note: "✏️" } })).toContain(emoji("✏️"));
  });

  it("renders Lucide placeholders with both naming conventions", () => {
    expect(render("::: note\nBody\n:::", { lucideIcons: true })).toContain(
      '<span class="admonition-icon admonition-icon-lucide" data-lucide-icon="LuStickyNote" data-lucide="sticky-note"></span>',
    );
    expect(render("::: tip\nBody\n:::", { lucideIcons: { tip: "grid-2x2" } })).toContain(
      'data-lucide-icon="LuGrid2X2" data-lucide="grid-2x2"',
    );
  });

  it("uses custom renders for both open and close", () => {
    const html = render("::: note\nBody\n:::", {
      customRenders: { note: { open: () => "<aside>\n", close: () => "</aside>\n" } },
    });
    expect(html).toBe("<aside>\n<p>Body</p>\n</aside>\n");
  });

  it("rejects invalid options", () => {
    expect(() => render("", { types: "note" as unknown as string[] })).toThrow(TypeError);
    expect(() => render("", { marker: "" })).toThrow(TypeError);
    expect(() => render("", { obsidianStyle: false, docusaurusStyle: false })).toThrow(TypeError);
    expect(() => render("", { customRenders: { note: { open: () => "" } } })).toThrow(TypeError);
  });
});
