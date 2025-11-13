import type MarkdownIt from "markdown-it";
import type { Options, PluginWithOptions } from "markdown-it";
import type { RuleBlock } from "markdown-it/lib/parser_block.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

import type {
  AdmonitionPluginOptions,
  MarkdownItAdmonitionOptions,
  RenderFunction,
  RenderEnvironment,
  ValidateFunction,
  CustomRenderPair,
} from "./options.js";

const MIN_MARKER_NUM = 3;

const defaultTypes: readonly string[] = ["note", "tip", "warning", "danger", "info"] as const;

/**
 * Helper functions for safe state property access
 */
const getLineStart = (state: StateBlock, line: number): number =>
  (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);

const getLineEnd = (state: StateBlock, line: number): number =>
  state.eMarks[line] ?? 0;

const getLineIndent = (state: StateBlock, line: number): number =>
  state.sCount[line] ?? 0;

/**
 * Check if marker sequence matches at given position
 * @param state - Parser state
 * @param pos - Starting position
 * @param max - Maximum position
 * @param marker - Marker string to match
 * @param markerLength - Length of marker
 * @returns Position after last matching marker character
 */
const matchMarkerSequence = (
  state: StateBlock,
  pos: number,
  max: number,
  marker: string,
  markerLength: number,
  startPos: number,
): number => {
  let checkPos = pos;
  while (checkPos <= max) {
    if (marker[(checkPos - startPos) % markerLength] !== state.src[checkPos]) {
      break;
    }
    checkPos++;
  }
  return checkPos;
};

/**
 * Interface for saved state values
 */
interface SavedState {
  parentType: StateBlock["parentType"];
  lineMax: number;
  blkIndent: number;
}

/**
 * Save relevant state properties
 */
const saveState = (state: StateBlock): SavedState => ({
  parentType: state.parentType,
  lineMax: state.lineMax,
  blkIndent: state.blkIndent,
});

/**
 * Restore previously saved state properties
 */
const restoreState = (state: StateBlock, saved: SavedState): void => {
  state.parentType = saved.parentType;
  state.lineMax = saved.lineMax;
  state.blkIndent = saved.blkIndent;
};

const defaultIcons: Readonly<Record<string, string>> = {
  note: "📝",
  tip: "💡",
  warning: "⚠️",
  danger: "🚨",
  info: "ℹ️",
} as const;

/**
 * Type guard to check if a value is a non-empty string
 */
const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.length > 0;
};

/**
 * Type guard to check if a value is a valid array of strings
 */
const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

/**
 * Validates plugin options at runtime
 * @throws {TypeError} if options are invalid
 */
const validatePluginOptions = (options: AdmonitionPluginOptions): void => {
  if (options.types !== undefined) {
    if (!isStringArray(options.types)) {
      throw new TypeError("options.types must be an array of strings");
    }
    if (options.types.some((type) => !isNonEmptyString(type))) {
      throw new TypeError("All type names must be non-empty strings");
    }
  }

  if (options.marker !== undefined && !isNonEmptyString(options.marker)) {
    throw new TypeError("options.marker must be a non-empty string");
  }

  if (options.icons !== undefined) {
    if (typeof options.icons !== "object" || options.icons === null) {
      throw new TypeError("options.icons must be an object");
    }
    for (const [key, value] of Object.entries(options.icons)) {
      if (!isNonEmptyString(key) || typeof value !== "string") {
        throw new TypeError("options.icons must map string keys to string values");
      }
    }
  }

  if (options.obsidianStyle !== undefined && typeof options.obsidianStyle !== "boolean") {
    throw new TypeError("options.obsidianStyle must be a boolean");
  }

  if (options.docusaurusStyle !== undefined && typeof options.docusaurusStyle !== "boolean") {
    throw new TypeError("options.docusaurusStyle must be a boolean");
  }

  if (options.customRenders !== undefined) {
    if (typeof options.customRenders !== "object" || options.customRenders === null) {
      throw new TypeError("options.customRenders must be an object");
    }
    for (const [key, value] of Object.entries(options.customRenders)) {
      if (!isNonEmptyString(key)) {
        throw new TypeError("customRenders keys must be non-empty strings");
      }
      if (value.open !== undefined && typeof value.open !== "function") {
        throw new TypeError(`customRenders.${key}.open must be a function`);
      }
      if (value.close !== undefined && typeof value.close !== "function") {
        throw new TypeError(`customRenders.${key}.close must be a function`);
      }
    }
  }
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
 * @param options - Configuration for the admonition container
 * @returns A RuleBlock function that parses the admonition syntax
 * @throws {TypeError} if options are invalid
 */
const createAdmonitionContainer = (
  options: MarkdownItAdmonitionOptions,
): RuleBlock => {
  // Validate options
  if (!isNonEmptyString(options.name)) {
    throw new TypeError("Admonition name must be a non-empty string");
  }
  if (options.marker !== undefined && !isNonEmptyString(options.marker)) {
    throw new TypeError("Marker must be a non-empty string");
  }

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
    const currentLineStart = getLineStart(state, startLine);
    const currentLineMax = getLineEnd(state, startLine);
    const currentLineIndent = getLineIndent(state, startLine);

    // Check out the first character quickly,
    // this should filter out most of non-containers
    if (markerStart !== state.src[currentLineStart]) return false;

    // Check out the rest of the marker string
    let pos = matchMarkerSequence(
      state,
      currentLineStart + 1,
      currentLineMax,
      marker,
      markerLength,
      currentLineStart,
    );

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
      const nextLineStart = getLineStart(state, nextLine);
      const nextLineMax = getLineEnd(state, nextLine);

      if (
        nextLineStart < nextLineMax &&
        getLineIndent(state, nextLine) < currentLineIndent
      )
        // non-empty line with negative indent should stop the list:
        // - :::
        //  test
        break;

      if (
        // closing fence should be indented same as opening one
        getLineIndent(state, nextLine) === currentLineIndent &&
        // match start
        markerStart === state.src[nextLineStart]
      ) {
        // check rest of marker
        pos = matchMarkerSequence(
          state,
          nextLineStart + 1,
          nextLineMax,
          marker,
          markerLength,
          nextLineStart,
        );

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

    const savedState = saveState(state);

    state.parentType = "container" as typeof state.parentType;

    // this will prevent lazy continuations from ever going past our end marker
    state.lineMax = nextLine;

    // this will update the block indent
    state.blkIndent = currentLineIndent ?? 0;

    const openToken = state.push(`admonition_${name}_open`, "div", 1);

    openToken.markup = markup;
    openToken.block = true;
    openToken.info = params;
    openToken.map = [startLine, nextLine];

    state.md.block.tokenize(state, startLine + 1, nextLine);

    const closeToken = state.push(`admonition_${name}_close`, "div", -1);

    closeToken.markup = markup;
    closeToken.block = true;

    restoreState(state, savedState);
    state.line = nextLine + (autoClosed ? 1 : 0);

    return true;
  };

  return container;
};

/**
 * Default render function for opening admonition tag
 * @param name - The admonition type name
 * @param icon - Optional icon to display
 * @param renderTitle - Whether to render the title section
 * @returns A render function
 */
const defaultOpenRender = (
  name: string,
  icon?: string,
  renderTitle: boolean = true,
): RenderFunction => {
  return (
    tokens: Token[],
    index: number,
    _options: Options,
    _env: RenderEnvironment,
    slf: Renderer,
  ): string => {
    const token = tokens[index];
    if (!token) {
      throw new Error(`Token at index ${index} is undefined`);
    }
    
    const info = token.info.trim();
    const title = info.slice(name.length).trim() || name.charAt(0).toUpperCase() + name.slice(1);

    // Add classes to the opening tag
    token.attrJoin("class", "admonition");
    token.attrJoin("class", `admonition-${name}`);

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
 * @param renderTitle - Whether the opening tag rendered a title section
 * @returns A render function
 */
const defaultCloseRender = (renderTitle: boolean = true): RenderFunction => {
  return (
    tokens: Token[],
    index: number,
    options: Options,
    _env: RenderEnvironment,
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
 * Helper function to register render rules for an admonition type
 * @param md - The markdown-it instance
 * @param type - The admonition type name
 * @param mergedIcons - Icon mapping for admonition types
 * @param customRenders - Custom render functions
 */
const registerRenderRules = (
  md: MarkdownIt,
  type: string,
  mergedIcons: Readonly<Record<string, string>>,
  customRenders: Readonly<Record<string, CustomRenderPair>>,
): void => {
  if (!md.renderer.rules[`admonition_${type}_open`]) {
    const customOpen = customRenders[type]?.open;
    const customClose = customRenders[type]?.close;

    md.renderer.rules[`admonition_${type}_open`] =
      customOpen || defaultOpenRender(type, mergedIcons[type], true);

    md.renderer.rules[`admonition_${type}_close`] =
      customClose || defaultCloseRender(true);
  }
};

/**
 * Create an Obsidian-style callout rule
 * @param types - Array of valid admonition type names
 * @returns A RuleBlock function that parses Obsidian callout syntax
 * @throws {TypeError} if types array is invalid
 */
const createObsidianCalloutRule = (
  types: readonly string[],
): RuleBlock => {
  // Validate types array
  if (!Array.isArray(types) || types.length === 0) {
    throw new TypeError("types must be a non-empty array");
  }
  if (!types.every(isNonEmptyString)) {
    throw new TypeError("All types must be non-empty strings");
  }
  const obsidianCallout: RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ): boolean => {
    const pos = getLineStart(state, startLine);
    const max = getLineEnd(state, startLine);

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
      const nextPos = getLineStart(state, nextLine);
      const nextMax = getLineEnd(state, nextLine);

      // Check if line starts with >
      if (state.src[nextPos] !== ">") break;

      // Extract content after > (and optional space)
      let contentStart = nextPos + 1;
      if (state.src[contentStart] === " ") contentStart++;

      contentLines.push(state.src.slice(contentStart, nextMax));
      nextLine++;
    }

    const savedState = saveState(state);

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
        const line = contentLines[i];
        if (line === undefined) continue;
        
        state.bMarks.push(offset);
        state.eMarks.push(offset + line.length);
        state.tShift.push(0);
        state.sCount.push(0);
        offset += line.length + 1; // +1 for newline
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

    restoreState(state, savedState);
    state.line = nextLine;

    return true;
  };

  return obsidianCallout;
};

/**
 * Main plugin function for markdown-it admonitions
 * 
 * Adds support for admonition/callout blocks in two syntax styles:
 * - Docusaurus-style: `::: type Title\nContent\n:::`
 * - Obsidian-style: `> [!type] Title\n> Content`
 * 
 * @param md - The markdown-it instance
 * @param options - Plugin configuration options
 * @throws {TypeError} if options are invalid
 * 
 * @example
 * ```typescript
 * import MarkdownIt from 'markdown-it';
 * import admonitionPlugin from 'markdown-it-admonitions';
 * 
 * const md = new MarkdownIt();
 * md.use(admonitionPlugin, {
 *   types: ['note', 'warning'],
 *   icons: { note: '📝' }
 * });
 * ```
 */
export const admonitionPlugin: PluginWithOptions<AdmonitionPluginOptions> = (
  md: MarkdownIt,
  options: AdmonitionPluginOptions = {},
): void => {
  // Validate options
  validatePluginOptions(options);

  const {
    types = defaultTypes,
    icons = defaultIcons,
    marker = ":",
    customRenders = {},
    obsidianStyle = true,
    docusaurusStyle = true,
  } = options;

  // Ensure at least one syntax style is enabled
  if (!obsidianStyle && !docusaurusStyle) {
    throw new TypeError("At least one of obsidianStyle or docusaurusStyle must be enabled");
  }

  // Create type-safe copies
  const typesArray: readonly string[] = Array.isArray(types) ? types : defaultTypes;
  const mergedIcons: Readonly<Record<string, string>> = { ...defaultIcons, ...icons };

  // Register Docusaurus-style syntax for each admonition type
  if (docusaurusStyle) {
    for (const type of typesArray) {
      const containerOptions: MarkdownItAdmonitionOptions = {
        name: type,
        marker,
        validate: (params: string): boolean => {
          const typeName = params.trim().split(" ", 2)[0];
          return typeName === type;
        },
      };

      const container = createAdmonitionContainer(containerOptions);

      md.block.ruler.before("fence", `admonition_${type}`, container, {
        alt: ["paragraph", "reference", "blockquote", "list"],
      });

      // Set up render rules (if not already set by Obsidian style)
      registerRenderRules(md, type, mergedIcons, customRenders);
    }
  }

  // Register Obsidian-style syntax
  if (obsidianStyle) {
    const obsidianRule = createObsidianCalloutRule(typesArray);
    md.block.ruler.before("blockquote", "obsidian_callout", obsidianRule, {
      alt: ["paragraph", "reference", "blockquote", "list"],
    });

    // Set up render rules for each type (shared with container style)
    for (const type of typesArray) {
      registerRenderRules(md, type, mergedIcons, customRenders);
    }
  }
};

export default admonitionPlugin;

// Export all types for users
export type { 
  AdmonitionPluginOptions, 
  MarkdownItAdmonitionOptions, 
  RenderFunction,
  RenderEnvironment,
  ValidateFunction,
  CustomRenderPair,
};

