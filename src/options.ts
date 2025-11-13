import type { Options } from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

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

  /**
   * Custom render function for opening tag
   */
  openRender?: (
    tokens: Token[],
    index: number,
    options: Options,
    env: unknown,
    slf: Renderer,
  ) => string;

  /**
   * Custom render function for closing tag
   */
  closeRender?: (
    tokens: Token[],
    index: number,
    options: Options,
    env: unknown,
    slf: Renderer,
  ) => string;

  /**
   * Icon to display for this admonition type
   */
  icon?: string;

  /**
   * Whether to render the title
   * @default true
   */
  renderTitle?: boolean;
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
    open?: MarkdownItAdmonitionOptions['openRender'];
    close?: MarkdownItAdmonitionOptions['closeRender'];
  }>;
}

