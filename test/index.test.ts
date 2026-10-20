import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

import admonitionPlugin, { type AdmonitionPluginOptions } from "../src/index.js";

const render = (src: string, options?: AdmonitionPluginOptions): string =>
  new MarkdownIt().use(admonitionPlugin, options).render(src);

const admonition = (type: string, title: string, content: string, icon = ""): string =>
  `<div class="admonition admonition-${type}">\n` +
  `<div class="admonition-title">${icon}<span class="admonition-title-text">${title}</span></div>\n` +
  `<div class="admonition-content">\n${content}</div>\n` +
  `</div>\n`;

const emoji = (icon: string): string => `<span class="admonition-icon" aria-hidden="true">${icon}</span>`;

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

  it("accepts the Docusaurus v3 [Title] syntax", () => {
    expect(render(":::note[My **Title**]\nBody\n:::")).toBe(
      admonition("note", "My <strong>Title</strong>", "<p>Body</p>\n", emoji("📝")),
    );
    expect(render("::: tip[]\nBody\n:::")).toBe(
      admonition("tip", "Tip", "<p>Body</p>\n", emoji("💡")),
    );
  });

  it("renders every default type", () => {
    const types = ["note", "tip", "warning", "danger", "info", "success", "question", "important", "caution"];
    for (const type of types) {
      expect(render(`::: ${type}\nBody\n:::`)).toContain(`class="admonition admonition-${type}"`);
    }
  });

  it("leaves unknown types as text", () => {
    expect(render("::: unknown\nBody\n:::")).toBe("<p>::: unknown\nBody\n:::</p>\n");
  });

  it("renders inline markdown in the title", () => {
    expect(render("::: note **Bold** `code` [link](https://example.com)\nBody\n:::")).toContain(
      '<strong>Bold</strong> <code>code</code> <a href="https://example.com">link</a></span></div>',
    );
  });

  it("escapes HTML in the title", () => {
    expect(render("::: note <b>Bold</b>\nBody\n:::")).toContain(
      "&lt;b&gt;Bold&lt;/b&gt;</span></div>",
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

  it("renders inline markdown in the title", () => {
    expect(render("> [!note] *Mind* the `gap`\n> Body")).toContain(
      "<em>Mind</em> the <code>gap</code></span></div>",
    );
  });

  it("renders a collapsed foldable callout with -", () => {
    expect(render("> [!note]- Folded\n> Body")).toBe(
      '<details class="admonition admonition-note">\n' +
        `<summary class="admonition-title">${emoji("📝")}<span class="admonition-title-text">Folded</span></summary>\n` +
        '<div class="admonition-content">\n<p>Body</p>\n</div>\n' +
        "</details>\n",
    );
  });

  it("renders an expanded foldable callout with +", () => {
    expect(render("> [!tip]+\n> Body")).toBe(
      '<details class="admonition admonition-tip" open="">\n' +
        `<summary class="admonition-title">${emoji("💡")}<span class="admonition-title-text">Tip</span></summary>\n` +
        '<div class="admonition-content">\n<p>Body</p>\n</div>\n' +
        "</details>\n",
    );
  });

  it("keeps a dash after a space as part of the title", () => {
    expect(render("> [!note] - not folded\n> Body")).toBe(
      admonition("note", "- not folded", "<p>Body</p>\n", emoji("📝")),
    );
  });

  it("matches the type case-insensitively", () => {
    expect(render("> [!TIP]\n> Body")).toBe(
      admonition("tip", "Tip", "<p>Body</p>\n", emoji("💡")),
    );
  });

  it("renders GitHub alert types", () => {
    expect(render("> [!IMPORTANT]\n> Body")).toBe(
      admonition("important", "Important", "<p>Body</p>\n", emoji("❗")),
    );
    expect(render("> [!CAUTION]\n> Body")).toBe(
      admonition("caution", "Caution", "<p>Body</p>\n", emoji("🛑")),
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

  it("renders inside list items", () => {
    expect(render("- item\n\n  > [!note]\n  > Body")).toBe(
      "<ul>\n<li>\n<p>item</p>\n" +
        admonition("note", "Note", "<p>Body</p>\n", emoji("📝")) +
        "</li>\n</ul>\n",
    );
  });

  it("renders nested lists", () => {
    expect(render("> [!note]\n> - a\n>   - b\n> - c")).toBe(
      admonition(
        "note",
        "Note",
        "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>c</li>\n</ul>\n",
        emoji("📝"),
      ),
    );
  });

  it("renders indented code", () => {
    expect(render("> [!note]\n>\n>     code")).toBe(
      admonition("note", "Note", "<pre><code>code\n</code></pre>\n", emoji("📝")),
    );
  });

  it("keeps lazy continuation lines in the callout", () => {
    expect(render("> [!note]\n> Body\nlazy")).toBe(
      admonition("note", "Note", "<p>Body\nlazy</p>\n", emoji("📝")),
    );
  });

  it("maps content tokens to their source lines", () => {
    const tokens = new MarkdownIt().use(admonitionPlugin).parse("Intro\n\n> [!note]\n> Body\n> - item", {});
    const maps = tokens.filter((token) => token.map).map((token) => [token.type, token.map]);
    expect(maps).toEqual([
      ["paragraph_open", [0, 1]],
      ["inline", [0, 1]],
      ["admonition_note_open", [2, 5]],
      ["paragraph_open", [3, 4]],
      ["inline", [3, 4]],
      ["bullet_list_open", [4, 5]],
      ["list_item_open", [4, 5]],
      ["paragraph_open", [4, 5]],
      ["inline", [4, 5]],
    ]);
  });

  it("is disabled by obsidianStyle: false", () => {
    expect(render("> [!note]\n> Body", { obsidianStyle: false })).toBe(
      "<blockquote>\n<p>[!note]\nBody</p>\n</blockquote>\n",
    );
  });
});

describe("rendering", () => {
  it("renders the same tokens twice without repeating classes", () => {
    const md = new MarkdownIt().use(admonitionPlugin);
    const tokens = md.parse("::: note\nBody\n:::\n\n> [!tip]-\n> Body", {});
    const first = md.renderer.render(tokens, md.options, {});
    expect(md.renderer.render(tokens, md.options, {})).toBe(first);
    expect(first).toContain('<div class="admonition admonition-note">');
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
      '<span class="admonition-icon admonition-icon-lucide" aria-hidden="true" data-lucide-icon="LuStickyNote" data-lucide="sticky-note"></span>',
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
