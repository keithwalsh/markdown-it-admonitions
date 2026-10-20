import type MarkdownIt from "markdown-it";
import type { Options } from "markdown-it";
import type { RuleBlock } from "markdown-it/lib/parser_block.mjs";
import type { RuleCore } from "markdown-it/lib/parser_core.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Ruler from "markdown-it/lib/ruler.mjs";
import type Token from "markdown-it/lib/token.mjs";

import type {
  AdmonitionPluginOptions,
  MarkdownItAdmonitionOptions,
  MarkdownItInstance,
  RenderFunction,
  RenderEnvironment,
  ValidateFunction,
  CustomRenderPair,
} from "./options.js";

const MIN_MARKER_NUM = 3;

/**
 * Matches the Docusaurus v3 title syntax after the marker: type[Title]
 */
const BRACKET_TITLE_PATTERN = /^\s*([^\s[]+)\[(.*)\]\s*$/;

/**
 * Read the admonition type from the text after the opening marker, lowercased
 * Accepts "type Title" and "type[Title]"
 */
const getContainerType = (params: string): string | undefined =>
  /^[^\s[]+/.exec(params.trim())?.[0].toLowerCase();

const defaultTypes: readonly string[] = [
  "note",
  "tip",
  "warning",
  "danger",
  "info",
  "success",
  "question",
  "important",
  "caution",
] as const;

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
 * @param position - Starting position
 * @param max - Maximum position
 * @param marker - Marker string to match
 * @param markerLength - Length of marker
 * @returns Position after last matching marker character
 */
const matchMarkerSequence = (
  state: StateBlock,
  position: number,
  max: number,
  marker: string,
  markerLength: number,
  startPosition: number,
): number => {
  let checkPosition = position;
  while (checkPosition <= max) {
    if (marker[(checkPosition - startPosition) % markerLength] !== state.src[checkPosition]) {
      break;
    }
    checkPosition++;
  }
  return checkPosition;
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
 * 
 * @param state - Parser state to save
 * @returns Saved state properties that can be restored later
 */
const saveState = (state: StateBlock): SavedState => ({
  parentType: state.parentType,
  lineMax: state.lineMax,
  blkIndent: state.blkIndent,
});

/**
 * Restore previously saved state properties
 * 
 * @param state - Parser state to restore to
 * @param saved - Previously saved state properties
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
  success: "✅",
  question: "❓",
  important: "❗",
  caution: "🛑",
} as const;

/**
 * Default Lucide icon mappings for admonition types
 * These correspond to icon names from react-icons/lu
 * @see https://react-icons.github.io/react-icons/icons/lu/
 */
const defaultLucideIcons: Readonly<Record<string, string>> = {
  note: "LuStickyNote",
  tip: "LuLightbulb",
  warning: "LuTriangleAlert",
  danger: "LuCircleAlert",
  info: "LuInfo",
  success: "LuCircleCheck",
  question: "LuCircleHelp",
  important: "LuMessageSquareWarning",
  caution: "LuOctagonAlert",
} as const;

/**
 * Convert a PascalCase icon name to Lucide's kebab-case name
 * Digits stay attached to a following lone capital, so "Axis3D" becomes "axis-3d"
 * and "Grid2X2" becomes "grid-2x2", while "Link2Off" becomes "link-2-off"
 */
const pascalToKebabCase = (name: string): string =>
  name
    .replace(/([^0-9])(?=[A-Z])/g, "$1-")
    .replace(/([0-9])(?=[A-Z][a-z])/g, "$1-")
    .toLowerCase()
    .replace(/([0-9]?)([a-z])(?=[0-9])/g, (match, digit: string, letter: string) =>
      digit ? match : `${letter}-`,
    );

/**
 * Convert a Lucide kebab-case icon name to the PascalCase used by react-icons/lu
 * Letters after digits are capitalised, so "grid-2x2" becomes "Grid2X2"
 */
const kebabToReactPascalCase = (name: string): string =>
  name
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    .replace(/([0-9])([a-z])/g, (_match, digit: string, letter: string) => digit + letter.toUpperCase());

/**
 * Convert an icon name in any supported convention to Lucide's kebab-case name
 * Supported conventions:
 * - react-icons/lu: "LuCircleAlert"
 * - Lucide: "circle-alert"
 * - lucide-react: "CircleAlert", "CircleAlertIcon" or "LucideCircleAlert"
 * @example toLucideIconName("LuCircleAlert") // "circle-alert"
 */
const toLucideIconName = (name: string): string => {
  if (/^Lu[A-Z0-9]/.test(name)) {
    return pascalToKebabCase(name.slice(2));
  }
  if (/^[A-Z]/.test(name)) {
    return pascalToKebabCase(name.replace(/^Lucide(?=[A-Z0-9])/, "").replace(/(.)Icon$/, "$1"));
  }
  return name;
};

/**
 * Convert an icon name in any supported convention to its react-icons/lu name
 * @example toReactIconName("circle-alert") // "LuCircleAlert"
 */
const toReactIconName = (name: string): string => `Lu${kebabToReactPascalCase(toLucideIconName(name))}`;

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
 * Type guard to check if a value is a boolean
 */
const isBoolean = (value: unknown): value is boolean => {
  return typeof value === "boolean";
};

/**
 * Type guard to check if a value is a valid object (not null, not array)
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Validates that types array contains only non-empty strings
 * @throws {TypeError} if types are invalid
 */
const validateTypes = (types: unknown): void => {
  if (!isStringArray(types)) {
    throw new TypeError("options.types must be an array of strings");
  }
  if (types.some((type) => !isNonEmptyString(type))) {
    throw new TypeError("All type names must be non-empty strings");
  }
};

/**
 * Validates icon mapping object
 * @throws {TypeError} if icons object is invalid
 */
const validateIcons = (icons: unknown): void => {
  if (!isPlainObject(icons)) {
    throw new TypeError("options.icons must be an object");
  }
  for (const [key, value] of Object.entries(icons)) {
    if (!isNonEmptyString(key) || typeof value !== "string") {
      throw new TypeError("options.icons must map string keys to string values");
    }
  }
};

/**
 * Validates lucideIcons option
 * @throws {TypeError} if lucideIcons option is invalid
 */
const validateLucideIcons = (lucideIcons: unknown): void => {
  if (typeof lucideIcons === "boolean") {
    return;
  }
  if (isPlainObject(lucideIcons)) {
    for (const [key, value] of Object.entries(lucideIcons)) {
      if (!isNonEmptyString(key) || typeof value !== "string") {
        throw new TypeError("options.lucideIcons must be a boolean or an object mapping string keys to string values");
      }
    }
    return;
  }
  throw new TypeError("options.lucideIcons must be a boolean or an object");
};

/**
 * Validates custom render pair for symmetry
 * Ensures both open and close functions are provided together
 * @throws {TypeError} if render pair is asymmetric or invalid
 */
const validateRenderPair = (key: string, pair: CustomRenderPair): void => {
  if (!isNonEmptyString(key)) {
    throw new TypeError("customRenders keys must be non-empty strings");
  }
  
  const hasOpen = pair.open !== undefined;
  const hasClose = pair.close !== undefined;
  
  // Enforce symmetric render pair: both open and close must be provided together
  if (hasOpen && !hasClose) {
    throw new TypeError(
      `customRenders.${key} has 'open' but missing 'close'. ` +
      `Both must be provided together for symmetric rendering to ensure proper HTML structure.`
    );
  }
  
  if (hasClose && !hasOpen) {
    throw new TypeError(
      `customRenders.${key} has 'close' but missing 'open'. ` +
      `Both must be provided together for symmetric rendering to ensure proper HTML structure.`
    );
  }
  
  // Type validation for render functions
  if (hasOpen && typeof pair.open !== "function") {
    throw new TypeError(`customRenders.${key}.open must be a function`);
  }
  if (hasClose && typeof pair.close !== "function") {
    throw new TypeError(`customRenders.${key}.close must be a function`);
  }
};

/**
 * Validates custom renders object
 * @throws {TypeError} if customRenders object or any render pair is invalid
 */
const validateCustomRenders = (customRenders: unknown): void => {
  if (!isPlainObject(customRenders)) {
    throw new TypeError("options.customRenders must be an object");
  }
  
  for (const [key, value] of Object.entries(customRenders)) {
    validateRenderPair(key, value as CustomRenderPair);
  }
};

/**
 * Validates plugin options at runtime with emphasis on symmetric operations
 * 
 * @throws {TypeError} if options violate symmetry principles or are invalid
 */
const validatePluginOptions = (options: AdmonitionPluginOptions): void => {
  if (options.types !== undefined) {
    validateTypes(options.types);
  }

  if (options.marker !== undefined && !isNonEmptyString(options.marker)) {
    throw new TypeError("options.marker must be a non-empty string");
  }

  if (options.icons !== undefined) {
    validateIcons(options.icons);
  }

  if (options.lucideIcons !== undefined) {
    validateLucideIcons(options.lucideIcons);
  }

  if (options.obsidianStyle !== undefined && !isBoolean(options.obsidianStyle)) {
    throw new TypeError("options.obsidianStyle must be a boolean");
  }

  if (options.docusaurusStyle !== undefined && !isBoolean(options.docusaurusStyle)) {
    throw new TypeError("options.docusaurusStyle must be a boolean");
  }

  if (options.customRenders !== undefined) {
    validateCustomRenders(options.customRenders);
  }
};

/**
 * Validates that complementary configuration options maintain symmetry
 * Ensures at least one syntax style is enabled to prevent incomplete plugin setup
 * 
 * @param obsidianStyle - Whether Obsidian-style syntax is enabled
 * @param docusaurusStyle - Whether Docusaurus-style syntax is enabled
 * @throws {TypeError} if no syntax styles are enabled (incomplete configuration)
 */
const validateComplementaryOptions = (
  obsidianStyle: boolean,
  docusaurusStyle: boolean,
): void => {
  if (!obsidianStyle && !docusaurusStyle) {
    throw new TypeError(
      "At least one of options.obsidianStyle or options.docusaurusStyle must be enabled. " +
      "Disabling both syntax styles prevents the plugin from functioning."
    );
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
 * Interface for closing fence search result
 */
interface ClosingFenceResult {
  found: boolean;
  nextLine: number;
}

/**
 * Searches for the closing fence of an admonition container
 * Extracted to reduce complexity in createAdmonitionContainer
 */
const findClosingFence = (
  state: StateBlock,
  startLine: number,
  endLine: number,
  currentLineIndent: number,
  markerStart: string,
  marker: string,
  markerLength: number,
  markerCount: number,
): ClosingFenceResult => {
  let nextLine = startLine + 1;

  for (; nextLine < endLine; nextLine++) {
    const nextLineStart = getLineStart(state, nextLine);
    const nextLineMax = getLineEnd(state, nextLine);

    // Non-empty line with negative indent should stop the search
    if (nextLineStart < nextLineMax && getLineIndent(state, nextLine) < currentLineIndent) {
      break;
    }

    // Check if this line could be a closing fence
    if (
      getLineIndent(state, nextLine) === currentLineIndent &&
      markerStart === state.src[nextLineStart]
    ) {
      let position = matchMarkerSequence(
        state,
        nextLineStart + 1,
        nextLineMax,
        marker,
        markerLength,
        nextLineStart,
      );

      // Closing fence must be at least as long as the opening one
      if (Math.floor((position - nextLineStart) / markerLength) >= markerCount) {
        position -= (position - nextLineStart) % markerLength;
        position = state.skipSpaces(position);

        if (position >= nextLineMax) {
          return { found: true, nextLine };
        }
      }
    }
  }

  return { found: false, nextLine };
};

/**
 * Create the Docusaurus-style container rule for all admonition types
 * @param types - Array of valid admonition type names
 * @param marker - Marker character(s) for the fence
 * @returns A RuleBlock function that parses the admonition syntax
 * @throws {TypeError} if the marker is invalid
 */
const createAdmonitionContainer = (
  types: readonly string[],
  marker: string,
): RuleBlock => {
  if (!isNonEmptyString(marker)) {
    throw new TypeError("Container marker must be a non-empty string");
  }

  const markerStart = marker[0]!; // Safe: marker is validated to be non-empty
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

    // Check out the first character quickly to filter out most non-containers
    if (markerStart !== state.src[currentLineStart]) return false;

    // Check out the rest of the marker string
    let position = matchMarkerSequence(
      state,
      currentLineStart + 1,
      currentLineMax,
      marker,
      markerLength,
      currentLineStart,
    );

    const markerCount = Math.floor((position - currentLineStart) / markerLength);
    if (markerCount < MIN_MARKER_NUM) return false;

    position -= (position - currentLineStart) % markerLength;
    const markup = marker.repeat(markerCount);
    const params = state.src.slice(position, currentLineMax);

    const containerType = getContainerType(params);
    const name = types.find((type) => type.toLowerCase() === containerType);
    if (name === undefined) return false;
    if (silent) return true;

    // Search for the closing fence
    const closingFence = findClosingFence(
      state,
      startLine,
      endLine,
      currentLineIndent,
      markerStart,
      marker,
      markerLength,
      markerCount,
    );

    const savedState = saveState(state);

    state.parentType = "container" as typeof state.parentType;
    state.lineMax = closingFence.nextLine;
    state.blkIndent = currentLineIndent ?? 0;

    // Push OPEN token first
    const openToken = state.push(`admonition_${name}_open`, "div", 1);
    openToken.markup = markup;
    openToken.block = true;
    // Normalise type[Title] to "type Title" so renderers read one format
    const bracketTitle = BRACKET_TITLE_PATTERN.exec(params);
    openToken.info = bracketTitle ? `${bracketTitle[1]} ${bracketTitle[2]}` : params;
    openToken.map = [startLine, closingFence.nextLine];

    // Tokenize content BETWEEN open and close tokens
    state.md.block.tokenize(state, startLine + 1, closingFence.nextLine);

    // Push CLOSE token after content
    const closeToken = state.push(`admonition_${name}_close`, "div", -1);
    closeToken.markup = markup;
    closeToken.block = true;

    restoreState(state, savedState);
    state.line = closingFence.nextLine + (closingFence.found ? 1 : 0);

    return true;
  };

  return container;
};

/**
 * Symmetric render pair interface to ensure open/close renders match
 */
interface RenderPair {
  open: RenderFunction;
  close: RenderFunction;
}

/**
 * Icon render configuration
 */
interface IconRenderConfig {
  /** The icon content (emoji or react-icons/lu icon name) */
  icon?: string;
  /** Lucide's kebab-case icon name, used by Lucide's createIcons() */
  lucideName?: string;
  /** Whether this is a Lucide icon (renders as data attribute) */
  isLucide: boolean;
}

/**
 * Create symmetric render pair for an admonition type
 * Ensures that open and close renders are properly matched
 * @param md - The markdown-it instance, used to render inline markdown in titles
 * @param name - The admonition type name
 * @param iconConfig - Icon configuration including content and type
 * @param renderTitle - Whether to render the title section (must be symmetric)
 * @returns A matched pair of open and close render functions
 */
const createDefaultRenderPair = (
  md: MarkdownIt,
  name: string,
  iconConfig: IconRenderConfig = { isLucide: false },
  renderTitle: boolean = true,
): RenderPair => {
  // Open render function
  const open: RenderFunction = (
    tokens: Token[],
    index: number,
    _options: Options,
    env: RenderEnvironment,
    slf: Renderer,
  ): string => {
    const token = tokens[index];
    if (!token) {
      throw new Error(`Token at index ${index} is undefined`);
    }
    
    const info = token.info.trim();
    const title = info.slice(name.length).trim() || name.charAt(0).toUpperCase() + name.slice(1);

    // Add classes to the opening tag, skipping any already there so
    // rendering the same tokens twice doesn't repeat them
    const classes = (token.attrGet("class") ?? "").split(" ");
    for (const className of ["admonition", `admonition-${name}`]) {
      if (!classes.includes(className)) token.attrJoin("class", className);
    }

    // Foldable callouts render as <details>, open when marked with "+"
    const foldable = token.tag === "details";
    if (foldable && token.meta?.fold === "+") {
      token.attrSet("open", "");
    }
    const titleTag = foldable ? "summary" : "div";

    let result = slf.renderToken(tokens, index, _options);

    if (renderTitle) {
      result += `<${titleTag} class="admonition-title">`;
      if (iconConfig.icon) {
        if (iconConfig.isLucide) {
          // Render Lucide icon placeholder with data attributes
          // data-lucide-icon holds the react-icons/lu name, data-lucide the Lucide name
          const lucideAttr = iconConfig.lucideName ? ` data-lucide="${escapeHtml(iconConfig.lucideName)}"` : "";
          result += `<span class="admonition-icon admonition-icon-lucide" aria-hidden="true" data-lucide-icon="${escapeHtml(iconConfig.icon)}"${lucideAttr}></span>`;
        } else {
          // Render emoji icon directly
          result += `<span class="admonition-icon" aria-hidden="true">${iconConfig.icon}</span>`;
        }
      }
      result += `<span class="admonition-title-text">${md.renderInline(title, env)}</span>`;
      result += `</${titleTag}>\n`;
      result += '<div class="admonition-content">\n';
    }

    return result;
  };

  // Close render function (symmetric with open)
  const close: RenderFunction = (
    tokens: Token[],
    index: number,
    options: Options,
    _env: RenderEnvironment,
    slf: Renderer,
  ): string => {
    let result = "";
    if (renderTitle) {
      result += "</div>\n"; // close admonition-content (matches open)
    }
    result += slf.renderToken(tokens, index, options);
    return result;
  };

  // Return symmetric pair
  return { open, close };
};

/**
 * Configuration for icon rendering in register function
 */
interface IconRenderOptions {
  /** Merged emoji icon mapping */
  emojiIcons: Readonly<Record<string, string>>;
  /** Merged Lucide icon mapping */
  lucideIcons: Readonly<Record<string, string>>;
  /** Whether to use Lucide icons */
  useLucide: boolean;
}

/**
 * Helper function to register symmetric render rules for an admonition type
 * Ensures that open and close render functions are always properly paired
 * Replaces rules from an earlier md.use() call so its options take effect
 * @param md - The markdown-it instance
 * @param type - The admonition type name
 * @param iconOptions - Icon rendering options
 * @param customRenders - Custom render functions (must provide both open and close together)
 */
const registerRenderRules = (
  md: MarkdownIt,
  type: string,
  iconOptions: IconRenderOptions,
  customRenders: Readonly<Record<string, CustomRenderPair>>,
): void => {
  // Get custom render pair (validated to have both open and close, or neither)
  const customRenderPair = customRenders[type];

  // Use symmetric render pair: either custom (both open and close) or default (both open and close)
  if (customRenderPair?.open && customRenderPair?.close) {
    // Custom renders are validated to be provided as a symmetric pair
    md.renderer.rules[`admonition_${type}_open`] = customRenderPair.open;
    md.renderer.rules[`admonition_${type}_close`] = customRenderPair.close;
  } else {
    // Build icon config based on whether Lucide icons are enabled
    const lucideIcon = iconOptions.lucideIcons[type];
    const iconConfig: IconRenderConfig = iconOptions.useLucide
      ? {
          icon: lucideIcon ? toReactIconName(lucideIcon) : undefined,
          lucideName: lucideIcon ? toLucideIconName(lucideIcon) : undefined,
          isLucide: true,
        }
      : { icon: iconOptions.emojiIcons[type], isLucide: false };
    
    // Create default symmetric render pair
    const defaultPair = createDefaultRenderPair(md, type, iconConfig, true);
    md.renderer.rules[`admonition_${type}_open`] = defaultPair.open;
    md.renderer.rules[`admonition_${type}_close`] = defaultPair.close;
  }
};

/**
 * Matches the first line of an Obsidian callout: [!type], an optional fold
 * marker (- collapsed, + expanded) and an optional title
 */
const CALLOUT_PATTERN = /^\[!([^\]\n]*)\]([+-]?)([^\n]*)(?:\n|$)/;

/**
 * Obsidian callout aliases and the type each one renders as
 * A registered type with the same name takes precedence over its alias
 */
const calloutAliases: ReadonlyMap<string, string> = new Map([
  ["hint", "tip"],
  ["faq", "question"],
  ["error", "danger"],
  ["check", "success"],
]);

/**
 * Find the blockquote_close token matching the blockquote_open at the given index
 * @returns Index of the matching close token, or -1 if none is found
 */
const findBlockquoteClose = (tokens: Token[], openIndex: number): number => {
  const level = tokens[openIndex]!.level;
  for (let index = openIndex + 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.type === "blockquote_close" && token.level === level) {
      return index;
    }
  }
  return -1;
};

/**
 * Create an Obsidian-style callout rule
 * Runs after block parsing and turns blockquotes whose first line is [!type]
 * into admonition tokens, so markdown-it's own blockquote rule handles the
 * content (lists, code, nesting, lazy continuation and source maps)
 * @param types - Array of valid admonition type names
 * @returns A core rule that converts callout blockquotes into admonitions
 * @throws {TypeError} if types array is invalid
 */
const createObsidianCalloutRule = (
  types: readonly string[],
): RuleCore => {
  // Validate types array
  if (!Array.isArray(types) || types.length === 0) {
    throw new TypeError("Callout rule types parameter must be a non-empty array");
  }
  if (!types.every(isNonEmptyString)) {
    throw new TypeError("Callout rule types parameter must contain only non-empty strings");
  }

  const obsidianCallout: RuleCore = (state: StateCore): void => {
    const tokens = state.tokens;

    for (let index = 0; index < tokens.length; index++) {
      const openToken = tokens[index]!;
      const paragraphOpen = tokens[index + 1];
      const inline = tokens[index + 2];

      if (
        openToken.type !== "blockquote_open" ||
        paragraphOpen?.type !== "paragraph_open" ||
        inline?.type !== "inline"
      ) {
        continue;
      }

      // Parse the [!type] pattern on the first line of the first paragraph
      const match = CALLOUT_PATTERN.exec(inline.content);
      if (!match) continue;

      // An alias renders as its type, titled with the alias by default
      const name = match[1]!.toLowerCase();
      const alias = types.includes(name) ? undefined : calloutAliases.get(name);
      const calloutType = alias ?? name;
      if (!types.includes(calloutType)) continue;

      const closeIndex = findBlockquoteClose(tokens, index);
      if (closeIndex === -1) continue;

      const fold = match[2]!;
      const title = match[3]!.trim() || (alias ? name.charAt(0).toUpperCase() + name.slice(1) : "");
      const tag = fold ? "details" : "div";

      openToken.type = `admonition_${calloutType}_open`;
      openToken.tag = tag;
      openToken.info = calloutType + (title ? " " + title : "");
      if (fold) openToken.meta = { ...openToken.meta, fold };

      const closeToken = tokens[closeIndex]!;
      closeToken.type = `admonition_${calloutType}_close`;
      closeToken.tag = tag;

      // Remove the [!type] line from the first paragraph, or the whole
      // paragraph when the line was all it held
      const rest = inline.content.slice(match[0].length);
      if (rest.length > 0) {
        inline.content = rest;
        if (paragraphOpen.map) paragraphOpen.map = [paragraphOpen.map[0] + 1, paragraphOpen.map[1]];
        if (inline.map) inline.map = [inline.map[0] + 1, inline.map[1]];
      } else {
        tokens.splice(index + 1, 3);
      }
    }
  };

  return obsidianCallout;
};

const DOCUSAURUS_RULE = "docusaurus_admonition";
const OBSIDIAN_RULE = "obsidian_callout";

/**
 * Replace a rule added by an earlier md.use() call, or add it the first time
 * Re-enables the rule in case an earlier call disabled its syntax style
 */
const setRule = <T>(
  ruler: Ruler<T>,
  name: string,
  rule: T,
  add: () => void,
  alt?: string[],
): void => {
  try {
    ruler.at(name, rule, alt ? { alt } : undefined);
  } catch {
    add();
  }
  ruler.enable(name, true);
};

const DOCUSAURUS_ALT = ["paragraph", "reference", "blockquote", "list"];

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
export const admonitionPlugin = (
  md: MarkdownItInstance,
  options: AdmonitionPluginOptions = {},
): void => {
  // Validate options for symmetry and correctness
  validatePluginOptions(options);

  const {
    types = defaultTypes,
    icons = defaultIcons,
    lucideIcons = false,
    marker = ":",
    customRenders = {},
    obsidianStyle = true,
    docusaurusStyle = true,
  } = options;

  // SYMMETRY VALIDATION: Ensure at least one complete syntax style is enabled
  validateComplementaryOptions(obsidianStyle, docusaurusStyle);

  // Create type-safe copies
  const typesArray: readonly string[] = Array.isArray(types) ? types : defaultTypes;
  const mergedEmojiIcons: Readonly<Record<string, string>> = { ...defaultIcons, ...icons };
  
  // Determine if Lucide icons are enabled and merge custom mappings
  const useLucideIcons = lucideIcons === true || isPlainObject(lucideIcons);
  const mergedLucideIcons: Readonly<Record<string, string>> = isPlainObject(lucideIcons)
    ? { ...defaultLucideIcons, ...lucideIcons }
    : defaultLucideIcons;

  // Build icon options for render rules
  const iconOptions: IconRenderOptions = {
    emojiIcons: mergedEmojiIcons,
    lucideIcons: mergedLucideIcons,
    useLucide: useLucideIcons,
  };

  // Register Docusaurus-style syntax
  if (docusaurusStyle) {
    const container = createAdmonitionContainer(typesArray, marker);
    setRule(
      md.block.ruler,
      DOCUSAURUS_RULE,
      container,
      () => md.block.ruler.before("fence", DOCUSAURUS_RULE, container, { alt: DOCUSAURUS_ALT }),
      DOCUSAURUS_ALT,
    );
  } else {
    md.block.ruler.disable(DOCUSAURUS_RULE, true);
  }

  // Register Obsidian-style syntax
  if (obsidianStyle) {
    const callout = createObsidianCalloutRule(typesArray);
    setRule(md.core.ruler, OBSIDIAN_RULE, callout, () =>
      md.core.ruler.after("block", OBSIDIAN_RULE, callout),
    );
  } else {
    md.core.ruler.disable(OBSIDIAN_RULE, true);
  }

  // Set up render rules for each type (shared by both styles)
  for (const type of typesArray) {
    registerRenderRules(md, type, iconOptions, customRenders);
  }
};

export default admonitionPlugin;

// Export all types for users
export type { 
  AdmonitionPluginOptions, 
  MarkdownItAdmonitionOptions, 
  MarkdownItInstance,
  RenderFunction,
  RenderEnvironment,
  ValidateFunction,
  CustomRenderPair,
};

