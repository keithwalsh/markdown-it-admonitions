import type { Options } from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

/**
 * Environment object passed to render functions
 * Can be extended by users for custom data
 */
export interface RenderEnvironment {
  [key: string]: unknown;
}

/**
 * Custom render function type for admonition tags
 * @param tokens - Array of tokens being rendered
 * @param index - Index of the current token
 * @param options - Markdown-it options
 * @param env - Environment object for custom data
 * @param slf - The renderer instance
 * @returns HTML string
 */
export type RenderFunction = (
  tokens: Token[],
  index: number,
  options: Options,
  env: RenderEnvironment,
  slf: Renderer,
) => string;

/**
 * Validation function type for admonition containers
 * @param params - The parameter string after the opening marker
 * @param markup - The full markup string (repeated marker characters)
 * @returns true if the params are valid for this admonition type
 */
export type ValidateFunction = (params: string, markup: string) => boolean;

/**
 * Configuration options for a single admonition type
 */
export interface MarkdownItAdmonitionOptions {
  /**
   * The name/type of the admonition (e.g., 'note', 'warning', 'tip')
   * Must be a non-empty string
   */
  name: string;

  /**
   * The marker character(s) to use for the container
   * @default ":"
   * @example ":" for ::: note, or "!" for !!! note
   */
  marker?: string;

  /**
   * Validate function to check if the params match this admonition type
   * If not provided, defaults to checking if params start with the name
   * @param params - The text after the opening marker
   * @param markup - The full marker string
   * @returns true if valid
   */
  validate?: ValidateFunction;
}

/**
 * Custom renderers for opening and closing tags of an admonition type
 * 
 * SYMMETRY REQUIREMENT: Both `open` and `close` must be provided together.
 * Providing only one will result in a validation error to ensure proper HTML structure.
 * 
 * @example
 * ```typescript
 * // ✅ Correct: Both open and close provided
 * {
 *   open: (tokens, idx, options, env, slf) => '<div class="custom">',
 *   close: (tokens, idx, options, env, slf) => '</div>'
 * }
 * 
 * // ❌ Invalid: Only open provided (will throw TypeError)
 * {
 *   open: (tokens, idx, options, env, slf) => '<div class="custom">'
 * }
 * 
 * // ❌ Invalid: Only close provided (will throw TypeError)
 * {
 *   close: (tokens, idx, options, env, slf) => '</div>'
 * }
 * ```
 */
export interface CustomRenderPair {
  /**
   * Custom render function for the opening tag
   * MUST be paired with `close` function for symmetric rendering
   */
  open?: RenderFunction;
  
  /**
   * Custom render function for the closing tag
   * MUST be paired with `open` function for symmetric rendering
   */
  close?: RenderFunction;
}

/**
 * Main plugin configuration options
 * 
 * SYMMETRY PRINCIPLES:
 * - At least one of `obsidianStyle` or `docusaurusStyle` must be true (default: both true)
 * - Custom render pairs must provide both `open` and `close` together
 * - All configuration follows complementary operation patterns for consistency
 */
export interface AdmonitionPluginOptions {
  /**
   * Array of admonition types to register
   * Each type must be a non-empty string
   * @default ['note', 'tip', 'warning', 'danger', 'info']
   * @example ['note', 'warning', 'custom']
   */
  types?: readonly string[];

  /**
   * Icon mapping for each admonition type
   * Icons are displayed in the title area of the admonition
   * Used when lucideIcons is false (default behavior)
   * @example { note: '📝', warning: '⚠️', custom: '✨' }
   */
  icons?: Readonly<Record<string, string>>;

  /**
   * Enable Lucide icons instead of emoji icons
   * When enabled, renders icon placeholders compatible with Lucide icons
   * 
   * Users must install react-icons: `npm install react-icons`
   * Import from: `import { IconName } from "react-icons/lu"`
   * @see https://react-icons.github.io/react-icons/icons/lu/
   * 
   * When true, uses default Lucide icon mappings:
   * - note: "LuStickyNote"
   * - tip: "LuLightbulb"
   * - warning: "LuTriangleAlert"
   * - danger: "LuCircleAlert"
   * - info: "LuInfo"
   * 
   * When an object, provide custom icon name mappings per type
   * 
   * @default false
   * @example true // Use default Lucide icons
   * @example { note: 'LuPencil', tip: 'LuZap' } // Custom mappings
   */
  lucideIcons?: boolean | Readonly<Record<string, string>>;

  /**
   * Marker character(s) to use for Docusaurus-style syntax
   * Must be at least one character
   * @default ":"
   * @example ":" produces ::: note syntax
   * @example "!" produces !!! note syntax
   */
  marker?: string;

  /**
   * Enable Obsidian-style callout syntax (> [!type] Title)
   * When enabled, allows using blockquote-based callout syntax
   * SYMMETRY: At least one of obsidianStyle or docusaurusStyle must be enabled
   * @default true
   */
  obsidianStyle?: boolean;

  /**
   * Enable Docusaurus-style syntax (::: type Title)
   * When enabled, allows using container-based syntax
   * SYMMETRY: At least one of obsidianStyle or docusaurusStyle must be enabled
   * @default true
   */
  docusaurusStyle?: boolean;

  /**
   * Custom render functions per admonition type
   * Allows complete control over HTML generation for each type
   * SYMMETRY REQUIREMENT: Each type must provide BOTH open and close functions together
   * @example
   * ```typescript
   * {
   *   note: {
   *     open: (tokens, idx, options, env, slf) => '<div class="my-note">',
   *     close: (tokens, idx, options, env, slf) => '</div>'
   *   }
   * }
   * ```
   */
  customRenders?: Readonly<Record<string, CustomRenderPair>>;
}

