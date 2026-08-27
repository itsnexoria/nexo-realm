/**
 * Single Worker entry point for the "Workers with static assets" deploy
 * path (wrangler deploy — NOT wrangler pages deploy).
 *
 * Why this file exists instead of functions/api/*.js:
 * The functions/api/*.js convention (onRequestGet etc.) is only ever
 * auto-detected by Cloudflare Pages' build system. A plain `wrangler
 * deploy` for a Worker has no concept of that folder — it just deploys
 * whatever `main` points to in wrangler.toml and serves everything else
 * from the `[assets]` directory. So both API routes live here instead,
 * and this file explicitly falls back to the static assets binding for
 * every other request.
 *
 * SSRF protections (unchanged from the original design):
 *  - only http/https
 *  - blocks localhost/.local/.internal, literal private/loopback/link-
 *    local IPs, and cloud metadata endpoints
 *  - re-validates the URL after redirects
 *  - caps response size and fetch time
 *  - edge-cached via the Cache API so a burst of visitors doesn't
 *    re-fetch every project on every page load
 */

const MAX_METADATA_BYTES = 300_000;
const METADATA_TIMEOUT_MS = 6000;
const METADATA_CACHE_TTL = 60 * 60; // 1 hour
const STATUS_TIMEOUT_MS = 5000;
const STATUS_CACHE_TTL = 120; // 2 minutes

// ---------------------------------------------------------------
// shared URL validation
// ---------------------------------------------------------------
function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0") return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  return false;
}

function isBlockedIP(hostname) {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }
  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc00:") || hostname.startsWith("fd")) {
    return true;
  }
  return false;
}

function validateUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http/https URLs are allowed" };
  }
  if (isBlockedHostname(parsed.hostname) || isBlockedIP(parsed.hostname)) {
    return { ok: false, error: "This host is not allowed" };
  }
  if (parsed.port && !["80", "443", ""].includes(parsed.port)) {
    return { ok: false, error: "Non-standard ports are not allowed" };
  }
  return { ok: true, url: parsed };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extraHeaders },
  });
}

async function fetchWithTimeout(url, method, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexoriaBot/1.0; +https://nexorealm.org)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------
// /api/status — lightweight up/down check
// ---------------------------------------------------------------
async function handleStatus(request, ctx) {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const validation = validateUrl(target || "");
  if (!validation.ok) {
    return json({ online: false, error: "Invalid or disallowed URL" });
  }

  let online = false;
  let httpStatus = null;
  try {
    let response = await fetchWithTimeout(validation.url.toString(), "HEAD", STATUS_TIMEOUT_MS);
    if (response.status === 405 || response.status === 501) {
      response = await fetchWithTimeout(validation.url.toString(), "GET", STATUS_TIMEOUT_MS);
    }
    httpStatus = response.status;
    online = response.status < 500;
  } catch {
    online = false;
  }

  const res = json({ online, httpStatus }, 200, { "Cache-Control": `public, max-age=${STATUS_CACHE_TTL}` });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------------------------------------------------------------
// /api/metadata — title/description/favicon/og:image scraper
// ---------------------------------------------------------------
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function sanitizeText(str, maxLen = 300) {
  if (!str) return null;
  const clean = decodeEntities(str).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
}
function extractHead(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return headMatch ? headMatch[1] : html.slice(0, 50_000);
}
function matchTag(head, regex) {
  const m = head.match(regex);
  return m ? m[1] : null;
}
function matchMeta(head, name) {
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i");
  return matchTag(head, re1) || matchTag(head, re2);
}
function resolveUrl(maybeRelative, base) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

async function handleMetadata(request, ctx) {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!target) return json({ error: "Missing url parameter" }, 400);

  const validation = validateUrl(target);
  if (!validation.ok) return json({ error: validation.error }, 400);

  let response;
  try {
    response = await fetchWithTimeout(validation.url.toString(), "GET", METADATA_TIMEOUT_MS);
  } catch {
    return json({ online: false, error: "Request failed or timed out" }, 200);
  }

  // Re-validate the final URL after redirects to prevent a redirect-based
  // SSRF bypass.
  const finalValidation = validateUrl(response.url || validation.url.toString());
  if (!finalValidation.ok) {
    return json({ online: false, error: "Redirected to a disallowed host" }, 200);
  }

  const httpStatus = response.status;
  const online = response.ok;

  let html = "";
  if (online) {
    const reader = response.body?.getReader();
    if (reader) {
      let received = 0;
      const chunks = [];
      while (received < MAX_METADATA_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
      }
      try {
        reader.cancel();
      } catch {}
      const buf = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c.subarray(0, Math.min(c.length, received - offset)), offset);
        offset += c.length;
      }
      html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
  }

  let result = { online, httpStatus };

  if (html) {
    const head = extractHead(html);
    const title = matchMeta(head, "og:title") || matchTag(head, /<title[^>]*>([^<]*)<\/title>/i);
    const description = matchMeta(head, "og:description") || matchMeta(head, "description");
    const ogImage = matchMeta(head, "og:image");
    let favicon =
      matchTag(head, /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i) ||
      matchTag(head, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i);

    result = {
      ...result,
      title: sanitizeText(title, 80),
      description: sanitizeText(description, 200),
      image: resolveUrl(ogImage, finalValidation.url),
      favicon: resolveUrl(favicon, finalValidation.url) || new URL("/favicon.ico", finalValidation.url).toString(),
    };
  }

  const res = json(result, 200, { "Cache-Control": `public, max-age=${METADATA_CACHE_TTL}` });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------------------------------------------------------------
// entry point
// ---------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/status") {
      return handleStatus(request, ctx);
    }
    if (request.method === "GET" && url.pathname === "/api/metadata") {
      return handleMetadata(request, ctx);
    }

    // everything else (index.html, css/js, images, robots.txt, etc.)
    // is served straight from the assets binding configured in
    // wrangler.toml ([assets] directory = "./public")
    return env.ASSETS.fetch(request);
  },
};
