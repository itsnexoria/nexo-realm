# Nexoria — nexorealm.org

The main hub for the Nexoria ecosystem. Static frontend (no build step,
no framework) + two Cloudflare Pages Functions for metadata/status.

## Deploy (Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy. The `functions/api/metadata.js` and `functions/api/status.js`
   files are picked up automatically as Pages Functions — no extra config needed.
5. Point `nexorealm.org` at the Pages project as a custom domain.

That's it — everything (fonts, assets, functions) is self-contained.

## Adding / removing a project

Open `js/config.js` and edit the `NEXORIA_PROJECTS` array. Minimum required:

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
  edge, 2min in the browser).
- Set `featured: true` to put a project in the large cinematic slot above
  the grid.
- Set `self: true` on an entry to exclude it from the grid/status checks
  (used for nexorealm.org itself).
- Reordering the array reorders featured projects; grid cards are sorted
  by category filter, not array order.

Socials live in `NEXORIA_SOCIALS` in the same file — supported icons are
`discord`, `github`, `x`, `instagram`, `youtube`, `twitch`, `tiktok` (add
more inline SVGs to the `ICONS` map in `js/main.js` if you need another
platform).

The "Currently building" card on the About section is `NEXORIA_CURRENTLY_BUILDING`
— leave `title` empty to hide it.

## Architecture

```
index.html            markup + section structure
css/styles.css         all styling, design tokens as CSS variables
js/config.js            <- the only file you should need to edit day-to-day
js/main.js              rendering, search/filter, metadata + status fetching, animations
functions/api/metadata.js   SSRF-safe metadata scraper (title/desc/favicon/og:image)
functions/api/status.js     SSRF-safe uptime check (HEAD, falls back to GET)
```

No client-side framework, no build step, no bundler — it's a handful of
files that load fast and are easy to reason about. Both API functions
validate and re-validate (post-redirect) target URLs to block requests to
localhost, private IP ranges, and cloud metadata endpoints, cap response
size and fetch time, and are cached at Cloudflare's edge so a burst of
visitors never re-fetches every project on every page load.

## Local preview

Any static file server works for the HTML/CSS/JS. The two API functions
only run under Cloudflare's Pages Functions runtime — locally, use
[Wrangler](https://developers.cloudflare.com/pages/functions/local-development/):

```bash
npx wrangler pages dev .
```

This serves the whole site (static files + `/api/metadata` + `/api/status`)
on `localhost:8788` with the real function code running.

## Notes

- Favicon/hero art in `assets/` was generated from your uploaded Nexoria
  logo (cropped and resized — the original 2.4MB source wasn't kept in
  the repo to keep things light).
- Stats in the hero band are pulled from `getEcosystemStats()` in
  `config.js` — deliberately no fake user/download numbers, just what's
  actually true (project count, category count, "24/7", "∞").
