# markdown-it-admonitions

A markdown-it plugin for rendering admonitions (callouts/alerts).

## Installation

```bash
npm install markdown-it-admonitions
```

Works with markdown-it 13, 14 and 15.

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

With CommonJS, use the named export (or `.default`):

```javascript
const MarkdownIt = require('markdown-it');
const { admonitionPlugin } = require('markdown-it-admonitions');

const md = new MarkdownIt().use(admonitionPlugin);
```

## Syntax

The plugin supports two syntax styles:

### Docusaurus Style (default)

```markdown
:::note Optional Title
Content goes here
:::
```

The Docusaurus v3 form, with the title in brackets, also works:

```markdown
:::note[Optional Title]
Content goes here
:::
```

### Obsidian Style (default)

```markdown
> [!note] Optional Title
> Content goes here
> More content
```

Add `-` or `+` straight after the type to make the callout foldable. It renders as a `<details>` element, collapsed with `-` and expanded with `+`:

```markdown
> [!tip]- Click to expand
> Hidden until opened
```

Obsidian's aliases `hint`, `faq`, `error` and `check` render as `tip`, `question`, `danger` and `success`, titled with the alias unless you give a title. A type you register under the same name takes precedence.

Type names are case-insensitive in both styles, so `::: NOTE` and `> [!NOTE]` both work.

Both styles can be enabled or disabled independently via options.

Titles can contain inline Markdown, such as `**bold**`, `` `code` `` or links.

## Default Types

- `note` 📝
- `tip` 💡
- `warning` ⚠️
- `danger` 🚨
- `info` ℹ️
- `success` ✅
- `question` ❓
- `important` ❗
- `caution` 🛑

`important` and `caution`, together with `note`, `tip` and `warning`, cover GitHub's alert types, so `> [!IMPORTANT]` and `> [!CAUTION]` render as admonitions.

## Options

```javascript
md.use(admonitionPlugin, {
  // Custom types to register
  types: ['note', 'tip', 'warning', 'danger', 'info', 'custom'],
  
  // Custom emoji icons for types (used when lucideIcons is false)
  icons: {
    custom: '✨',
    note: '📌'
  },
  
  // Use Lucide icons instead of emojis (default: false)
  // See "Lucide Icons" section below for details
  lucideIcons: false,
  
  // Custom marker for Docusaurus style (default is ":")
  marker: ':',
  
  // Enable/disable syntax styles
  // NOTE: At least one must be enabled (default: both true)
  obsidianStyle: true,    // Enable > [!type] syntax (default: true)
  docusaurusStyle: true,  // Enable ::: type syntax (default: true)
  
  // Custom render functions per type
  // Provide both 'open' and 'close'
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

Using the plugin again on the same instance replaces the earlier options.

### Lucide Icons

The plugin supports [Lucide icons](https://lucide.dev/), either through [react-icons](https://react-icons.github.io/react-icons/icons/lu/) or through Lucide's own libraries (`lucide`, `lucide-react`). When enabled, the plugin renders icon placeholders that you hydrate with whichever library you use.

**Enable Lucide icons:**

```javascript
// Use default Lucide icon mappings
md.use(admonitionPlugin, {
  lucideIcons: true
});

// Or provide custom icon name mappings
md.use(admonitionPlugin, {
  lucideIcons: {
    note: 'LuPencil',      // react-icons/lu name
    tip: 'zap',            // Lucide name
    custom: 'Sparkles'     // lucide-react component name
  }
});
```

**Icon name conventions:** custom mappings accept either naming convention, and you can mix them:

| Convention | Example |
|------------|---------|
| react-icons/lu | `LuCircleAlert` |
| Lucide (kebab-case) | `circle-alert` |
| lucide-react component | `CircleAlert`, `CircleAlertIcon`, `LucideCircleAlert` |

Whichever convention you use, every placeholder carries the icon name in both forms:

- `data-lucide-icon`: the react-icons/lu name (e.g. `LuCircleAlert`)
- `data-lucide`: the Lucide name (e.g. `circle-alert`)

**Default Lucide icon mappings:**

| Type | react-icons/lu | Lucide | Icon |
|------|----------------|--------|------|
| note | `LuStickyNote` | `sticky-note` | 📄 |
| tip | `LuLightbulb` | `lightbulb` | 💡 |
| warning | `LuTriangleAlert` | `triangle-alert` | ⚠️ |
| danger | `LuCircleAlert` | `circle-alert` | 🚨 |
| info | `LuInfo` | `info` | ℹ️ |
| success | `LuCircleCheck` | `circle-check` | ✅ |
| question | `LuCircleHelp` | `circle-help` | ❓ |
| important | `LuMessageSquareWarning` | `message-square-warning` | ❗ |
| caution | `LuOctagonAlert` | `octagon-alert` | 🛑 |

**HTML output with Lucide icons enabled:**

```html
<div class="admonition admonition-note">
  <div class="admonition-title">
    <span class="admonition-icon admonition-icon-lucide" aria-hidden="true" data-lucide-icon="LuStickyNote" data-lucide="sticky-note"></span>
    <span class="admonition-title-text">Note</span>
  </div>
  <div class="admonition-content">
    Content here
  </div>
</div>
```

**Hydrating with Lucide (`lucide`):**

```bash
npm install lucide
```

```javascript
import { createIcons, icons } from 'lucide';

// Call after rendering markdown; replaces every [data-lucide] placeholder with an SVG
createIcons({ icons });
```

**Hydrating with react-icons:**

```bash
npm install react-icons
```

```jsx
import { useEffect } from 'react';
import * as LucideIcons from 'react-icons/lu';
import { createRoot } from 'react-dom/client';

function hydrateAdmonitionIcons() {
  const iconElements = document.querySelectorAll('[data-lucide-icon]');
  
  iconElements.forEach((el) => {
    const iconName = el.getAttribute('data-lucide-icon');
    const IconComponent = LucideIcons[iconName];
    
    if (IconComponent) {
      const root = createRoot(el);
      root.render(<IconComponent />);
    }
  });
}

// Call after rendering markdown
useEffect(() => {
  hydrateAdmonitionIcons();
}, [markdownContent]);
```

With `lucide-react`, read the `data-lucide` name instead and render it with `DynamicIcon` from `lucide-react/dynamic` (`<DynamicIcon name={el.dataset.lucide} />`).

### Option validation

Invalid options throw a `TypeError` when the plugin is used. Two rules go beyond plain type checks:

- Custom renders must provide `open` and `close` together, since one without the other would leave unbalanced HTML.
- `obsidianStyle` and `docusaurusStyle` can't both be `false`.

## Styling

The package includes default CSS files with attractive styling for all admonition types. Two versions are available:

- `admonitions.css` - Full version with comments and formatting (recommended for development)
- `admonitions.min.css` - Minified version for production use

### In HTML

```html
<!-- Development -->
<link rel="stylesheet" href="node_modules/markdown-it-admonitions/admonitions.css">

<!-- Production -->
<link rel="stylesheet" href="node_modules/markdown-it-admonitions/admonitions.min.css">
```

### In JavaScript/TypeScript

```javascript
// Development
import 'markdown-it-admonitions/admonitions.css';

// Production
import 'markdown-it-admonitions/admonitions.min.css';
```

### Features

The default stylesheet includes:

- Modern, clean design with subtle shadows and borders
- Unique colour schemes for each admonition type:
  - **Note**: Blue theme
  - **Tip**: Green theme
  - **Info**: Cyan theme
  - **Warning**: Orange theme
  - **Danger**: Red theme
  - **Success**: Green theme
  - **Question**: Purple theme
  - **Important**: Pink theme
  - **Caution**: Deep orange theme
- Automatic dark mode support via `prefers-color-scheme`, with theme overrides (see [Dark mode](#dark-mode))
- Colours driven by CSS custom properties, so a custom type needs one line of CSS
- A neutral grey for custom types that don't set a colour
- Responsive design for mobile devices
- Print-friendly styles
- Proper spacing for nested content (lists, code blocks, etc.)

### Demo

You can preview all admonition styles by opening `demo.html` in your browser. The demo includes:
- All five default admonition types
- Examples with various content types (lists, code blocks, nested elements)
- A theme toggle button to test dark mode

### Customisation

Each type sets one custom property, `--admonition-color`, and the border, background and title colours are derived from it. To colour a custom type or recolour a built-in one:

```css
.admonition-custom {
  --admonition-color: #e91e63;
}
```

You can also override the derived colours directly:

| Property | Default (light) | Default (dark) |
|----------|-----------------|----------------|
| `--admonition-color` | per type; `#6b7280` for custom types | same |
| `--admonition-bg` | `--admonition-color` at 10% opacity | at 15% opacity |
| `--admonition-title-color` | `--admonition-color` mixed 60% with black | mixed 60% with white |

The derived colours use `color-mix()`, which all current browsers support.

### Dark mode

The stylesheet follows the operating system's `prefers-color-scheme` setting. If your site has its own theme switch, put a class or attribute on `<html>` or `<body>` (or any ancestor of the admonitions):

- `class="dark"` or `data-theme="dark"` turns dark mode on.
- `class="light"` or `data-theme="light"` keeps the light colours, even when the operating system is in dark mode. Light-only sites should set one of these.

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

# Build the package (includes CSS minification)
npm run build

# Build just the CSS (generates minified version)
npm run build:css

# Watch mode for development
npm run dev
```

### Working with CSS

The minified CSS file (`admonitions.min.css`) is **automatically generated** from the source file (`admonitions.css`) during the build process. 

**Important:** Only edit `admonitions.css`. The minified version is auto-generated and tracked in `.gitignore`.

When you make changes to `admonitions.css`:
1. Edit the source CSS file
2. Run `npm run build:css` to regenerate the minified version (or `npm run build` for full build)
3. The minified version will be automatically created for distribution

## License

MIT

