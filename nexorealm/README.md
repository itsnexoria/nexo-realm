# Nexoria — nexorealm.org

The main hub for the Nexoria ecosystem. Deploys as a Cloudflare **Worker
with static assets** (the `wrangler deploy` path) — one small Worker
handles `/api/status` and `/api/metadata`, everything else is served
straight from `public/`.

> If you're setting this up fresh: this is **not** the classic Cloudflare
> Pages Functions convention (`functions/api/*.js`) — that only gets
> auto-detected by Pages' own build system. Since this project deploys
> with plain `wrangler deploy`, both API routes are inlined in
> `worker.js` instead, with a fallback to the static assets binding for
> everything else. If you ever see `/api/status` 404 after a deploy,
> this is the first thing to check — it usually means Wrangler picked up
> a stale `wrangler.toml` or the deploy command changed back to
> something Pages-flavored.

## Deploy (Cloudflare dashboard → Workers & Pages)

You've already got this wired up correctly:

- **Deploy command:** `npx wrangler deploy`
- **Root directory:** `/`
- **Production branch:** `main`

Just push to `main` and Cloudflare rebuilds automatically. `wrangler.toml`
at the repo root points `main` at `worker.js` and serves `./public` as
static assets — no other dashboard changes needed.

## Local preview

```bash
npx wrangler dev
```

This runs the real Worker (API routes included) against your local
files, typically on `localhost:8787`.

## Adding / removing a project

Open `public/js/config.js` and edit the `NEXORIA_PROJECTS` array. Minimum required:

```js
{
  name: "New Project",
  url: "https://new.nexorealm.org",
  category: "Tools",
}
```

- Title, description, favicon, and preview image are fetched automatically
  from the URL via `/api/metadata` (cached 1h at the edge, 6h in the visitor's
  browser).
- Online/offline status is checked via `/api/status` (cached 2min at the
  edge, 2min in the browser). If a check can't reach the backend at all,
  the UI shows "Unknown"/"Status unavailable" — it never claims a site is
  down without a real check confirming that.
- Set `featured: true` to put a project in the large cinematic slot above
  the grid.
- Set `self: true` on an entry to exclude it from the grid/status checks
  (used for nexorealm.org itself).

### Software projects (`type: "software"`)

Software entries skip the live online/offline model (there's nothing to
ping for an unreleased desktop app) and get their own card treatment —
version/platform tags, a static build-state badge, and explicit links
instead of a single "Visit" action:

```js
{
  name: "Nexo Dev",
  url: "https://github.com/itsnexoria/nexo-dev", // canonical identity
  category: "Software",
  type: "software",
  description: "...",
  platform: "Windows · Linux",   // optional tag
  version: "v0.4",               // optional tag
  githubUrl: "...",              // shown as its own link + used as click-through
  downloadUrl: "...",            // optional — only rendered if set
  docsUrl: "...",                // optional — only rendered if set
  status: "development",         // shows "In development" instead of a live dot
}
```

Socials live in `NEXORIA_SOCIALS` in the same file — supported icons are
`discord`, `github`, `x`, `instagram`, `youtube`, `twitch`, `tiktok` (add
more inline SVGs to the `ICONS` map in `js/main.js` if you need another
platform).

The "Currently building" card on the About section is `NEXORIA_CURRENTLY_BUILDING`
— leave `title` empty to hide it.

## Architecture

```
wrangler.toml           Worker config — main entry + static assets binding
worker.js                the Worker: routes /api/status + /api/metadata, falls
                          back to the assets binding for everything else
public/
  index.html              markup + section structure
  css/styles.css          all styling, design tokens as CSS variables
  js/config.js             <- the only file you should need to edit day-to-day
  js/main.js               rendering, search/filter, metadata + status fetching, animations
  assets/                 logo/favicon files
  robots.txt, sitemap.xml, _headers
```

No client-side framework, no build step, no bundler for the frontend —
it's a handful of files that load fast and are easy to reason about.
`worker.js` validates and re-validates (post-redirect) target URLs to
block requests to localhost, private IP ranges, and cloud metadata
endpoints, caps response size and fetch time, and is cached at
Cloudflare's edge so a burst of visitors never re-fetches every project
on every page load.

## Notes

- Favicon/hero art in `public/assets/` was generated from your uploaded
  Nexoria logo (cropped and resized).
- Stats in the hero band are pulled from `getEcosystemStats()` in
  `config.js` — deliberately no fake user/download numbers, just what's
  actually true (project count, category count, "24/7", "∞").
