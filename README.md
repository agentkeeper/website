# AgentKeeper landing page

A static site built with Tailwind CSS v4 and HTMX. It needs no framework and no server-side code.

## Develop

```sh
npm install
npm run dev      # copies vendor assets, watches CSS, serves on http://localhost:4173
```

Open the site over HTTP, not `file://`, because HTMX loads the tab panels from `public/partials/`.

## Build

```sh
npm run build    # writes public/assets/css/site.css and copies htmx + fonts
```

Deploy the `public/` directory to any static host.

## Layout

| Path | What it is |
| --- | --- |
| `src/input.css` | Tailwind entry: theme tokens (ink / keeper palette), components, self-hosted fonts |
| `public/index.html` | The page |
| `public/partials/app-records.html` | Platform preview: live records view (HTMX-loaded) |
| `public/partials/app-map.html` | Platform preview: honeycomb host map, one hexagon per host (HTMX-loaded) |
| `public/assets/js/site.js` | Sample-record generator for the live view, tab sync, pilot-form fallback |

## Sovereignty by construction

Fonts (Inter, JetBrains Mono) and htmx are vendored from npm into `public/assets/`.
The page loads nothing from third-party origins and sets no cookies. Keep it that way:
no Google Fonts, CDNs or analytics snippets.

## Themes

The page follows the system setting (dark by default, light under `prefers-color-scheme: light`).
A three-state toggle in the header (light · system · dark) overrides it via `html[data-theme]`;
the choice is kept in `localStorage` (`ak-theme`) and applied by an inline script before first paint.
All colours are tokens in `src/input.css`; the light values live in one `@media` block there.
SVG diagrams use hex colours in their markup, and CSS rules in the same file map each hex to a
token so they switch too. Headings use `text-ink-50`, not `text-white`, for the same reason.

## Hero animation

The *how it works* diagram is an inline SVG in `index.html`, animated by `initFlow` in `site.js`.
It follows a fixed script of calls (`SCRIPT`), pauses when off-screen or on the pause button, and renders
a static state under `prefers-reduced-motion`.

## Platform views

The platform window and the session trace show sample data. The live records are generated in
`site.js`; the agent map's hosts are embedded as JSON in `public/partials/app-map.html`.

## To wire up before launch

- **Pilot form**: posts to `/api/pilot` via `hx-post`. Until an endpoint exists, a failed
  post shows a `mailto:` fallback. The endpoint should return an HTML fragment, which is
  swapped into `#pilot-result`.
- **Contact address**: `hello@agentkeeper.eu` is a placeholder. It appears in `index.html`
  (footer) and `site.js` (`FALLBACK_EMAIL`).
