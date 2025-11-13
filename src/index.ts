import type MarkdownIt from "markdown-it";
import type { Options, PluginWithOptions } from "markdown-it";
import type { RuleBlock } from "markdown-it/lib/parser_block.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

import type {
  AdmonitionPluginOptions,
  MarkdownItAdmonitionOptions,
} from "./options.js";

const MIN_MARKER_NUM = 3;

const defaultTypes = ["note", "tip", "warning", "danger", "info"];

const defaultIcons: Record<string, string> = {
  note: "📝",
  tip: "💡",
  warning: "⚠️",
  danger: "🚨",
  info: "ℹ️",
};

/**
 * Escape HTML special characters
 */
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Create a container rule for a specific admonition type
 */
const createAdmonitionContainer = (
  options: MarkdownItAdmonitionOptions,
): RuleBlock => {
  const {
    name,
    marker = ":",
    validate = (params: string): boolean =>
      params.trim().split(" ", 2)[0] === name,
  } = options;

  const markerStart = marker[0];
  const markerLength = marker.length;

  const container: RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ): boolean => {
    const currentLineStart = state.bMarks[startLine] + state.tShift[startLine];
    const currentLineMax = state.eMarks[startLine];
    const currentLineIndent = state.sCount[startLine];

    // Check out the first character quickly,
    // this should filter out most of non-containers
    if (markerStart !== state.src[currentLineStart]) return false;

    let pos = currentLineStart + 1;

    // Check out the rest of the marker string
    while (pos <= currentLineMax) {
      if (marker[(pos - currentLineStart) % markerLength] !== state.src[pos])
        break;
      pos++;
    }

    const markerCount = Math.floor((pos - currentLineStart) / markerLength);

    if (markerCount < MIN_MARKER_NUM) return false;

    pos -= (pos - currentLineStart) % markerLength;

    const markup = marker.repeat(markerCount);
    const params = state.src.slice(pos, currentLineMax);

    if (!validate(params, markup)) return false;

    // Since start is found, we can report success here in validation mode
    if (silent) return true;

    let nextLine = startLine + 1;
    let autoClosed = false;

    // Search for the end of the block
    for (
      ;
      // nextLine should be accessible outside the loop,
      // unclosed block should be auto closed by end of document.
      // also block seems to be auto closed by end of parent
      nextLine < endLine;
      nextLine++
    ) {
      const nextLineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextLineMax = state.eMarks[nextLine];

      if (
        nextLineStart < nextLineMax &&
        state.sCount[nextLine] < currentLineIndent
      )
        // non-empty line with negative indent should stop the list:
        // - :::
        //  test
        break;

      if (
        // closing fence should be indented same as opening one
        state.sCount[nextLine] === currentLineIndent &&
        // match start
        markerStart === state.src[nextLineStart]
      ) {
        // check rest of marker
        for (pos = nextLineStart + 1; pos <= nextLineMax; pos++)
          if (marker[(pos - nextLineStart) % markerLength] !== state.src[pos])
            break;

        // closing code fence must be at least as long as the opening one
        if (Math.floor((pos - nextLineStart) / markerLength) >= markerCount) {
          // make sure tail has spaces only
          pos -= (pos - nextLineStart) % markerLength;
          pos = state.skipSpaces(pos);

          if (pos >= nextLineMax) {
            // found!
            autoClosed = true;
            break;
          }
        }
      }
    }

    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;
    const oldBlkIndent = state.blkIndent;

    state.parentType = "container" as typeof state.parentType;

    // this will prevent lazy continuations from ever going past our end marker
    state.lineMax = nextLine;

    // this will update the block indent
    state.blkIndent = currentLineIndent;

    const openToken = state.push(`admonition_${name}_open`, "div", 1);

    openToken.markup = markup;
    openToken.block = true;
    openToken.info = params;
    openToken.map = [startLine, nextLine];

    state.md.block.tokenize(state, startLine + 1, nextLine);

    const closeToken = state.push(`admonition_${name}_close`, "div", -1);

    closeToken.markup = markup;
    closeToken.block = true;

    state.parentType = oldParent;
    state.lineMax = oldLineMax;
    state.blkIndent = oldBlkIndent;
    state.line = nextLine + (autoClosed ? 1 : 0);

    return true;
  };

  return container;
};

/**
 * Default render function for opening admonition tag
 */
const defaultOpenRender = (
  name: string,
  icon?: string,
  renderTitle: boolean = true,
) => {
  return (
    tokens: Token[],
    index: number,
    _options: Options,
    _env: unknown,
    slf: Renderer,
  ): string => {
    const token = tokens[index];
    const info = token.info.trim();
    const title = info.slice(name.length).trim() || name.charAt(0).toUpperCase() + name.slice(1);

    // Add classes to the opening tag
    tokens[index].attrJoin("class", "admonition");
    tokens[index].attrJoin("class", `admonition-${name}`);

    let result = slf.renderToken(tokens, index, _options);

    if (renderTitle) {
      result += '<div class="admonition-title">';
      if (icon) {
        result += `<span class="admonition-icon">${icon}</span>`;
      }
      result += escapeHtml(title);
      result += "</div>\n";
      result += '<div class="admonition-content">\n';
    }

    return result;
  };
};

/**
 * Default render function for closing admonition tag
 */
const defaultCloseRender = (renderTitle: boolean = true) => {
  return (
    tokens: Token[],
    index: number,
    options: Options,
    _env: unknown,
    slf: Renderer,
  ): string => {
    let result = "";
    if (renderTitle) {
      result += "</div>\n"; // close admonition-content
    }
    result += slf.renderToken(tokens, index, options);
    return result;
  };
};

/**
 * Create an Obsidian-style callout rule
 */
const createObsidianCalloutRule = (
  types: string[],
): RuleBlock => {
  const obsidianCallout: RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ): boolean => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];

    // Check if line starts with >
    if (state.src[pos] !== ">") return false;

    // Get the content after >
    let linePos = pos + 1;
    
    // Skip optional space after >
    if (state.src[linePos] === " ") linePos++;

    // Check for [!type] pattern
    if (state.src[linePos] !== "[" || state.src[linePos + 1] !== "!") {
      return false;
    }

    // Find the closing ]
    let typeEnd = linePos + 2;
    while (typeEnd < max && state.src[typeEnd] !== "]") {
      typeEnd++;
    }

    if (typeEnd >= max) return false;

    // Extract the type
    const calloutType = state.src.slice(linePos + 2, typeEnd).toLowerCase();

    // Validate against registered types
    if (!types.includes(calloutType)) return false;

    // Extract optional title
    let title = "";
    if (typeEnd + 1 < max) {
      title = state.src.slice(typeEnd + 1, max).trim();
    }

    if (silent) return true;

    // Find all lines that are part of this blockquote
    let nextLine = startLine + 1;
    const contentLines: string[] = [];

    while (nextLine < endLine) {
      const nextPos = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextMax = state.eMarks[nextLine];

      // Check if line starts with >
      if (state.src[nextPos] !== ">") break;

      // Extract content after > (and optional space)
      let contentStart = nextPos + 1;
      if (state.src[contentStart] === " ") contentStart++;

      contentLines.push(state.src.slice(contentStart, nextMax));
      nextLine++;
    }

    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;

    state.parentType = "blockquote" as typeof state.parentType;

    // Create opening token
    const openToken = state.push(`admonition_${calloutType}_open`, "div", 1);
    openToken.markup = ">";
    openToken.block = true;
    openToken.info = title;
    openToken.map = [startLine, nextLine];

    // Process content lines
    if (contentLines.length > 0) {
      const contentSrc = contentLines.join("\n");
      const oldSrc = state.src;
      const oldBMarks = state.bMarks;
      const oldEMarks = state.eMarks;
      const oldTShift = state.tShift;
      const oldSCount = state.sCount;

      state.src = contentSrc;
      state.bMarks = [];
      state.eMarks = [];
      state.tShift = [];
      state.sCount = [];

      let offset = 0;
      for (let i = 0; i < contentLines.length; i++) {
        state.bMarks.push(offset);
        state.eMarks.push(offset + contentLines[i].length);
        state.tShift.push(0);
        state.sCount.push(0);
        offset += contentLines[i].length + 1; // +1 for newline
      }

      state.lineMax = contentLines.length;
      state.md.block.tokenize(state, 0, contentLines.length);

      state.src = oldSrc;
      state.bMarks = oldBMarks;
      state.eMarks = oldEMarks;
      state.tShift = oldTShift;
      state.sCount = oldSCount;
    }

    // Create closing token
    const closeToken = state.push(`admonition_${calloutType}_close`, "div", -1);
    closeToken.markup = ">";
    closeToken.block = true;

    state.parentType = oldParent;
    state.lineMax = oldLineMax;
    state.line = nextLine;

    return true;
  };

  return obsidianCallout;
};

/**
 * Main plugin function
 */
export const admonitionPlugin: PluginWithOptions<AdmonitionPluginOptions> = (
  md: MarkdownIt,
  options: AdmonitionPluginOptions = {},
) => {
  const {
    types = defaultTypes,
    icons = defaultIcons,
    marker = ":",
    customRenders = {},
    obsidianStyle = true,
    docusaurusStyle = true,
  } = options;

  const mergedIcons = { ...defaultIcons, ...icons };

  // Register Docusaurus-style syntax for each admonition type
  if (docusaurusStyle) {
    for (const type of types) {
      const containerOptions: MarkdownItAdmonitionOptions = {
        name: type,
        marker,
        validate: (params: string): boolean => {
          const typeName = params.trim().split(" ", 2)[0];
          return typeName === type;
        },
        icon: mergedIcons[type],
        renderTitle: true,
      };

      const container = createAdmonitionContainer(containerOptions);

      md.block.ruler.before("fence", `admonition_${type}`, container, {
        alt: ["paragraph", "reference", "blockquote", "list"],
      });

      // Set up render rules (if not already set by Obsidian style)
      if (!md.renderer.rules[`admonition_${type}_open`]) {
        const customOpen = customRenders[type]?.open;
        const customClose = customRenders[type]?.close;

        md.renderer.rules[`admonition_${type}_open`] =
          customOpen ||
          defaultOpenRender(
            type,
            containerOptions.icon,
            containerOptions.renderTitle,
          );

        md.renderer.rules[`admonition_${type}_close`] =
          customClose || defaultCloseRender(containerOptions.renderTitle);
      }
    }
  }

  // Register Obsidian-style syntax
  if (obsidianStyle) {
    const obsidianRule = createObsidianCalloutRule(types);
    md.block.ruler.before("blockquote", "obsidian_callout", obsidianRule, {
      alt: ["paragraph", "reference", "blockquote", "list"],
    });

    // Set up render rules for each type (shared with container style)
    for (const type of types) {
      if (!md.renderer.rules[`admonition_${type}_open`]) {
        const customOpen = customRenders[type]?.open;
        const customClose = customRenders[type]?.close;

        md.renderer.rules[`admonition_${type}_open`] =
          customOpen ||
          defaultOpenRender(type, mergedIcons[type], true);

        md.renderer.rules[`admonition_${type}_close`] =
          customClose || defaultCloseRender(true);
      }
    }
  }
};

export default admonitionPlugin;
export type { AdmonitionPluginOptions, MarkdownItAdmonitionOptions };

