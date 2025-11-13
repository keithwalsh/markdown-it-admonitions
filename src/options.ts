import type { Options } from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

/**
 * Custom render function type for admonition tags
 */
export type RenderFunction = (
  tokens: Token[],
  index: number,
  options: Options,
  env: unknown,
  slf: Renderer,
) => string;

export interface MarkdownItAdmonitionOptions {
  /**
   * The name/type of the admonition (e.g., 'note', 'warning', 'tip')
   */
  name: string;

  /**
   * The marker character(s) to use for the container
   * @default ":"
   */
  marker?: string;

  /**
   * Validate function to check if the params match this admonition type
   */
  validate?: (params: string, markup: string) => boolean;
}

export interface AdmonitionPluginOptions {
  /**
   * Array of admonition types to register
   * @default ['note', 'tip', 'warning', 'danger', 'info']
   */
  types?: string[];

  /**
   * Icon mapping for each admonition type
   */
  icons?: Record<string, string>;

  /**
   * Marker character(s) to use for Docusaurus-style syntax
   * @default ":"
   */
  marker?: string;

  /**
   * Enable Obsidian-style callout syntax (> [!type] Title)
   * @default true
   */
  obsidianStyle?: boolean;

  /**
   * Enable Docusaurus-style syntax (::: type Title)
   * @default true
   */
  docusaurusStyle?: boolean;

  /**
   * Custom render functions per type
   */
  customRenders?: Record<string, {
    open?: RenderFunction;
    close?: RenderFunction;
  }>;
}

