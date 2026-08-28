/**
 * GET /api/metadata?url=https://example.com
 *
 * Fetches a target site, parses <title>, meta description, favicon,
 * and Open Graph tags, and returns sanitized JSON.
 *
 * Runs on Cloudflare Pages Functions. Cached at the edge for 1 hour
 * via the Cache API — the frontend also caches in localStorage so a
 * page load never blocks on this or re-fetches every project on
 * every visit (see js/main.js loadMetadata()).
 *
 * SSRF protections:
 *  - only http/https
 *  - only GET requests, to the URL given, no redirect chains followed blindly
 *  - hostname must resolve publicly (blocks localhost, .local, .internal)
 *  - literal IPs are blocked if private/loopback/link-local/reserved
 *  - a fixed allowlist of hostnames is NOT required, but obviously
 *    internal-looking hosts are rejected outright
 *  - response size and time are both capped
 */

const MAX_BYTES = 300_000; // 300KB is plenty for <head>
const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0") return true;
  // cloud metadata endpoints
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  return false;
}

function isBlockedIP(hostname) {
  // Only checks literal IPs in the URL — DNS-level SSRF (a hostname that
  // *resolves* to a private IP) can't be fully closed from a Worker without
  // a resolver call, but Cloudflare's network path won't route to private
  // ranges from the edge, and this catches the direct/obvious cases.
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true;
    return false;
  }
  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc00:") || hostname.startsWith("fd")) {
    return true; // IPv6 loopback / link-local / unique-local
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
  // handles both orderings of name/content and property/content attrs
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

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow", // fetch() caps redirect count internally; final URL is re-validated below
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexoriaMetadataBot/1.0; +https://nexorealm.org)",
        Accept: "text/html,application/xhtml+xml",
      },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!target) {
    return json({ error: "Missing url parameter" }, 400);
  }

  const validation = validateUrl(target);
  if (!validation.ok) {
    return json({ error: validation.error }, 400);
  }

  let response;
  try {
    response = await fetchWithTimeout(validation.url.toString(), FETCH_TIMEOUT_MS);
  } catch (err) {
    return json({ online: false, error: "Request failed or timed out" }, 200);
  }

  // Re-validate the final URL after redirects to prevent a redirect-based SSRF bypass
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
      while (received < MAX_BYTES) {
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

  const res = json(result, 200, { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}
