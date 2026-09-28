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

## Hero animation

The *how it works* diagram is an inline SVG in `index.html`, animated by `initFlow` in `site.js`.
It follows a fixed script of calls (`SCRIPT`), pauses when off-screen or on the pause button, and renders
a static state under `prefers-reduced-motion`. OpenAI and DeepSeek appear as upstreams for illustration;
the gateway only forwards to Anthropic today, and the caption says so.

## Platform preview

The product window in the hero and the session trace are **design mockups**: there is no platform UI yet.
Sample records in `site.js` follow `agentkeeper.trace/v1` (`../agentkeeper/internal/trace/record.go`).
They use the pipeline's planned stage names (`policies`, `filtering`, `rate_limiting`) alongside the
shipped ones. The *host* shown on the agent map is not part of the v1 record yet.

## To wire up before launch

- **Pilot form**: posts to `/api/pilot` via `hx-post`. Until an endpoint exists, a failed
  post shows a `mailto:` fallback. The endpoint should return an HTML fragment, which is
  swapped into `#pilot-result`.
- **Contact address**: `hello@agentkeeper.eu` is a placeholder. It appears in `index.html`
  (footer) and `site.js` (`FALLBACK_EMAIL`).
- **Roadmap and stage badges**: these reflect `../agentkeeper/specs` as of 2026-09-28
  (pipeline, identification and tracing shipped). Update them as specs land.
