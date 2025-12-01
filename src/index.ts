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
    throw new TypeError("Container options.name must be a non-empty string");
  }
  if (options.marker !== undefined && !isNonEmptyString(options.marker)) {
    throw new TypeError("Container options.marker must be a non-empty string");
  }

  const {
    name,
    marker = ":",
    validate = (params: string): boolean =>
      params.trim().split(" ", 2)[0] === name,
  } = options;

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

    if (!validate(params, markup)) return false;
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
    openToken.info = params;
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
  /** The icon content (emoji or Lucide icon name) */
  icon?: string;
  /** Whether this is a Lucide icon (renders as data attribute) */
  isLucide: boolean;
}

/**
 * Create symmetric render pair for an admonition type
 * Ensures that open and close renders are properly matched
 * @param name - The admonition type name
 * @param iconConfig - Icon configuration including content and type
 * @param renderTitle - Whether to render the title section (must be symmetric)
 * @returns A matched pair of open and close render functions
 */
const createDefaultRenderPair = (
  name: string,
  iconConfig: IconRenderConfig = { isLucide: false },
  renderTitle: boolean = true,
): RenderPair => {
  // Open render function
  const open: RenderFunction = (
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
      if (iconConfig.icon) {
        if (iconConfig.isLucide) {
          // Render Lucide icon placeholder with data attribute
          // Users can hydrate this with react-icons or Lucide library
          result += `<span class="admonition-icon admonition-icon-lucide" data-lucide-icon="${escapeHtml(iconConfig.icon)}"></span>`;
        } else {
          // Render emoji icon directly
          result += `<span class="admonition-icon">${iconConfig.icon}</span>`;
        }
      }
      result += escapeHtml(title);
      result += "</div>\n";
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
  // Skip if already registered
  if (md.renderer.rules[`admonition_${type}_open`]) {
    return;
  }

  // Get custom render pair (validated to have both open and close, or neither)
  const customRenderPair = customRenders[type];

  // Use symmetric render pair: either custom (both open and close) or default (both open and close)
  if (customRenderPair?.open && customRenderPair?.close) {
    // Custom renders are validated to be provided as a symmetric pair
    md.renderer.rules[`admonition_${type}_open`] = customRenderPair.open;
    md.renderer.rules[`admonition_${type}_close`] = customRenderPair.close;
  } else {
    // Build icon config based on whether Lucide icons are enabled
    const iconConfig: IconRenderConfig = iconOptions.useLucide
      ? { icon: iconOptions.lucideIcons[type], isLucide: true }
      : { icon: iconOptions.emojiIcons[type], isLucide: false };
    
    // Create default symmetric render pair
    const defaultPair = createDefaultRenderPair(type, iconConfig, true);
    md.renderer.rules[`admonition_${type}_open`] = defaultPair.open;
    md.renderer.rules[`admonition_${type}_close`] = defaultPair.close;
  }
};

/**
 * Interface for Obsidian callout parsing result
 */
interface ObsidianCalloutInfo {
  calloutType: string;
  title: string;
}

/**
 * Parses the [!type] pattern from an Obsidian callout line
 * @returns Callout info if valid pattern found, null otherwise
 */
const parseObsidianCalloutType = (
  state: StateBlock,
  startLine: number,
  types: readonly string[],
): ObsidianCalloutInfo | null => {
  const position = getLineStart(state, startLine);
  const max = getLineEnd(state, startLine);

  // Check if line starts with >
  if (state.src[position] !== ">") return null;

  let linePosition = position + 1;
  
  // Skip optional space after >
  if (state.src[linePosition] === " ") linePosition++;

  // Check for [!type] pattern
  if (state.src[linePosition] !== "[" || state.src[linePosition + 1] !== "!") {
    return null;
  }

  // Find the closing ]
  let typeEndPosition = linePosition + 2;
  while (typeEndPosition < max && state.src[typeEndPosition] !== "]") {
    typeEndPosition++;
  }

  if (typeEndPosition >= max) return null;

  // Extract and validate the type
  const calloutType = state.src.slice(linePosition + 2, typeEndPosition).toLowerCase();
  if (!types.includes(calloutType)) return null;

  // Extract optional title
  const title = typeEndPosition + 1 < max 
    ? state.src.slice(typeEndPosition + 1, max).trim()
    : "";

  return { calloutType, title };
};

/**
 * Extracts content lines from an Obsidian blockquote
 * Collects all lines starting with > until a non-blockquote line is found
 */
const extractObsidianContent = (
  state: StateBlock,
  startLine: number,
  endLine: number,
): { contentLines: string[]; nextLine: number } => {
  const contentLines: string[] = [];
  let nextLine = startLine + 1;

  while (nextLine < endLine) {
    const nextPosition = getLineStart(state, nextLine);
    const nextMax = getLineEnd(state, nextLine);

    if (state.src[nextPosition] !== ">") break;

    let contentStartPosition = nextPosition + 1;
    if (state.src[contentStartPosition] === " ") contentStartPosition++;

    contentLines.push(state.src.slice(contentStartPosition, nextMax));
    nextLine++;
  }

  return { contentLines, nextLine };
};

/**
 * Interface for saved parsing arrays
 */
interface SavedParsingArrays {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
}

/**
 * Processes content lines by temporarily replacing state parsing arrays
 * SYMMETRIC OPERATION: Saves and restores parsing context
 */
const processContentWithTemporaryState = (
  state: StateBlock,
  contentLines: string[],
): void => {
  if (contentLines.length === 0) return;

  const contentSrc = contentLines.join("\n");
  
  // SYMMETRIC OPERATION: Save original parsing arrays
  const saved: SavedParsingArrays = {
    src: state.src,
    bMarks: state.bMarks,
    eMarks: state.eMarks,
    tShift: state.tShift,
    sCount: state.sCount,
  };

  // Set up temporary state for content processing
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
    offset += line.length + 1;
  }

  state.lineMax = contentLines.length;
  state.md.block.tokenize(state, 0, contentLines.length);

  // SYMMETRIC OPERATION: Restore original parsing arrays
  state.src = saved.src;
  state.bMarks = saved.bMarks;
  state.eMarks = saved.eMarks;
  state.tShift = saved.tShift;
  state.sCount = saved.sCount;
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
    throw new TypeError("Callout rule types parameter must be a non-empty array");
  }
  if (!types.every(isNonEmptyString)) {
    throw new TypeError("Callout rule types parameter must contain only non-empty strings");
  }

  const obsidianCallout: RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean,
  ): boolean => {
    // Parse callout type and title
    const calloutInfo = parseObsidianCalloutType(state, startLine, types);
    if (!calloutInfo) return false;

    if (silent) return true;

    // Extract content lines
    const { contentLines, nextLine } = extractObsidianContent(state, startLine, endLine);

    // SYMMETRIC OPERATION: Save state before modifications
    const savedState = saveState(state);
    state.parentType = "blockquote" as typeof state.parentType;

    const calloutTypeName = calloutInfo.calloutType;
    const info = calloutTypeName + (calloutInfo.title ? " " + calloutInfo.title : "");

    // Push OPEN token first
    const openToken = state.push(`admonition_${calloutTypeName}_open`, "div", 1);
    openToken.markup = ">";
    openToken.block = true;
    openToken.info = info;
    openToken.map = [startLine, nextLine];

    // Process content BETWEEN open and close tokens
    processContentWithTemporaryState(state, contentLines);

    // Push CLOSE token after content
    const closeToken = state.push(`admonition_${calloutTypeName}_close`, "div", -1);
    closeToken.markup = ">";
    closeToken.block = true;

    // SYMMETRIC OPERATION: Restore state after modifications
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
      registerRenderRules(md, type, iconOptions, customRenders);
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
      registerRenderRules(md, type, iconOptions, customRenders);
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

