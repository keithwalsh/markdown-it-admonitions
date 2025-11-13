# markdown-it-admonitions

A markdown-it plugin for rendering admonitions (callouts/alerts).

## Installation

```bash
npm install markdown-it-admonitions
```

## Usage

```javascript
import MarkdownIt from 'markdown-it';
import admonitionPlugin from 'markdown-it-admonitions';

const md = new MarkdownIt();
md.use(admonitionPlugin);

const result = md.render(`
:::note Custom Title
This is a note admonition with a custom title.
:::

:::warning
This is a warning with the default title.
:::
`);
```

## Syntax

The plugin supports two syntax styles:

### Docusaurus Style (default)

```markdown
:::note Optional Title
Content goes here
:::
```

### Obsidian Style (default)

```markdown
> [!note] Optional Title
> Content goes here
> More content
```

Both styles can be enabled or disabled independently via options.

## Default Types

- `note` 📝
- `tip` 💡
- `warning` ⚠️
- `danger` 🚨
- `info` ℹ️

## Options

```javascript
md.use(admonitionPlugin, {
  // Custom types to register
  types: ['note', 'tip', 'warning', 'danger', 'info', 'custom'],
  
  // Custom icons for types
  icons: {
    custom: '✨',
    note: '📌'
  },
  
  // Custom marker for Docusaurus style (default is ":")
  marker: ':',
  
  // Enable/disable syntax styles
  obsidianStyle: true,    // Enable > [!type] syntax (default: true)
  docusaurusStyle: true,  // Enable ::: type syntax (default: true)
  
  // Custom render functions per type
  customRenders: {
    custom: {
      open: (tokens, idx, options, env, slf) => {
        tokens[idx].attrJoin('class', 'my-custom-class');
        return slf.renderToken(tokens, idx, options);
      },
      close: (tokens, idx, options, env, slf) => {
        return slf.renderToken(tokens, idx, options);
      }
    }
  }
});
```

## TypeScript

The plugin is written in TypeScript and includes full type definitions:

```typescript
import type { AdmonitionPluginOptions } from 'markdown-it-admonitions';

const options: AdmonitionPluginOptions = {
  types: ['note', 'warning'],
  icons: {
    note: '📝'
  }
};
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for development
npm run dev
```

## License

MIT

