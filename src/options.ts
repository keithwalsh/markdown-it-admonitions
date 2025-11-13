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
 */
export interface CustomRenderPair {
  /**
   * Custom render function for the opening tag
   */
  open?: RenderFunction;
  
  /**
   * Custom render function for the closing tag
   */
  close?: RenderFunction;
}

/**
 * Main plugin configuration options
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
   * @example { note: '📝', warning: '⚠️', custom: '✨' }
   */
  icons?: Readonly<Record<string, string>>;

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
   * @default true
   */
  obsidianStyle?: boolean;

  /**
   * Enable Docusaurus-style syntax (::: type Title)
   * When enabled, allows using container-based syntax
   * @default true
   */
  docusaurusStyle?: boolean;

  /**
   * Custom render functions per admonition type
   * Allows complete control over HTML generation for each type
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

