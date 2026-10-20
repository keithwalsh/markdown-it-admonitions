import type MarkdownIt from "markdown-it";

/**
 * A markdown-it instance
 * Derived from the default export so it resolves against the typings of
 * markdown-it 13 and 14 (@types/markdown-it) and markdown-it 15 (bundled)
 */
export type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/**
 * Environment object passed to render functions
 * Can be extended by users for custom data
 */
export interface RenderEnvironment {
  [key: string]: unknown;
}

/**
 * Custom render function type for admonition tags
 * Same signature as a markdown-it renderer rule:
 * (tokens, index, options, env, slf) => HTML string
 */
export type RenderFunction = NonNullable<MarkdownItInstance["renderer"]["rules"][string]>;

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
 * Custom renderers for the opening and closing tags of an admonition type
 * Provide both or neither; giving only one throws a TypeError, since it
 * would leave unbalanced HTML
 *
 * @example
 * ```typescript
 * {
 *   open: (tokens, idx, options, env, slf) => '<div class="custom">',
 *   close: (tokens, idx, options, env, slf) => '</div>'
 * }
 * ```
 */
export interface CustomRenderPair {
  /** Renderer for the opening tag, paired with `close` */
  open?: RenderFunction;

  /** Renderer for the closing tag, paired with `open` */
  close?: RenderFunction;
}

/**
 * Main plugin configuration options
 */
export interface AdmonitionPluginOptions {
  /**
   * Array of admonition types to register
   * Each type must be a non-empty string
   * @default ['note', 'tip', 'warning', 'danger', 'info', 'success', 'question', 'important', 'caution']
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
   * - success: "LuCircleCheck"
   * - question: "LuCircleHelp"
   * - important: "LuMessageSquareWarning"
   * - caution: "LuOctagonAlert"
   * 
   * When an object, provide custom icon name mappings per type.
   * Names can use either convention:
   * - react-icons/lu: "LuPencil", "LuCircleAlert"
   * - Lucide: "pencil", "circle-alert" (or lucide-react's "CircleAlert")
   * 
   * @default false
   * @example true // Use default Lucide icons
   * @example { note: 'LuPencil', tip: 'LuZap' } // react-icons names
   * @example { note: 'pencil', tip: 'zap' } // Lucide names
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
   * At least one of obsidianStyle and docusaurusStyle must be enabled
   * @default true
   */
  obsidianStyle?: boolean;

  /**
   * Enable Docusaurus-style syntax (::: type Title)
   * At least one of obsidianStyle and docusaurusStyle must be enabled
   * @default true
   */
  docusaurusStyle?: boolean;

  /**
   * Custom render functions per admonition type
   * Allows complete control over HTML generation for each type
   * Each type must provide both open and close
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

