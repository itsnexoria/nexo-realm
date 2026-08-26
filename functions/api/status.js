/**
 * GET /api/status?url=https://example.com
 *
 * Lightweight HEAD (falling back to a short-circuited GET) check used
 * purely to render an online/offline dot. Shares the same SSRF
 * protections as metadata.js but stays cheap: no body is read.
 *
 * Cached at the edge for 2 minutes so a burst of page loads doesn't
 * hammer every project on every visit.
 */

const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 120;

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
    return { ok: false };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
  if (isBlockedHostname(parsed.hostname) || isBlockedIP(parsed.hostname)) return { ok: false };
  if (parsed.port && !["80", "443", ""].includes(parsed.port)) return { ok: false };
  return { ok: true, url: parsed };
}

async function fetchWithTimeout(url, method, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexoriaStatusBot/1.0; +https://nexorealm.org)" },
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

  const validation = validateUrl(target || "");
  if (!validation.ok) {
    return json({ online: false, error: "Invalid or disallowed URL" });
  }

  let online = false;
  let httpStatus = null;
  try {
    // Try HEAD first; some hosts don't support it, so fall back to GET.
    let response = await fetchWithTimeout(validation.url.toString(), "HEAD", FETCH_TIMEOUT_MS);
    if (response.status === 405 || response.status === 501) {
      response = await fetchWithTimeout(validation.url.toString(), "GET", FETCH_TIMEOUT_MS);
    }
    httpStatus = response.status;
    online = response.status < 500;
  } catch {
    online = false;
  }

  const res = json({ online, httpStatus }, { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

function json(data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extraHeaders },
  });
}
