/**
 * socials.js — single source of truth is /data/socials.json.
 * Add/remove accounts there; this script renders whatever's in it, and
 * shows an honest empty state with instructions if the array is empty.
 *
 * Icons are fully self-hosted — no CDN, no external request, so nothing
 * here can be blocked by an ad-blocker or fail from a slow/blocked CDN:
 *  - Brand marks come from js/brand-icons.js (Simple Icons path data,
 *    inlined directly as <path> — see that file).
 *  - Anything without a bundled brand mark (LinkedIn, whose logo Simple
 *    Icons had to remove; generic email/website) falls back to the shared
 *    Lucide sprite at /icons/lucide-sprite.svg.
 */
(function () {
  "use strict";

  function getAssetPrefix() {
    var segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length && segments[segments.length - 1].indexOf(".") !== -1) {
      segments.pop();
    }
    return segments.length ? new Array(segments.length + 1).join("../") : "";
  }

  var ASSET_PREFIX = getAssetPrefix();
  var DATA_URL = ASSET_PREFIX + "data/socials.json";

  var PLATFORM_LABEL = {
    discord: "Discord", github: "GitHub", youtube: "YouTube", tiktok: "TikTok",
    instagram: "Instagram", facebook: "Facebook", x: "X", reddit: "Reddit",
    linkedin: "LinkedIn", twitch: "Twitch", email: "Email", website: "Website"
  };

  // Platforms with no bundled brand mark — sprite icon to use instead.
  var SPRITE_FALLBACK = { linkedin: "briefcase", email: "mail", website: "globe" };

  // Brand marks whose official color is near-black — render with the
  // page's ink color instead so they stay visible in both themes.
  var USE_INK_COLOR = { tiktok: true, x: true, github: true };

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function spriteIcon(name) {
    return (
      '<svg class="icon" aria-hidden="true" width="20" height="20"><use href="' +
      ASSET_PREFIX + "icons/lucide-sprite.svg#" + name + '"></use></svg>'
    );
  }

  function iconMarkup(s) {
    var slug = (s.icon || s.platform || "").toLowerCase();
    var brand = window.BRAND_ICONS && window.BRAND_ICONS[slug];
    if (brand) {
      var fill = USE_INK_COLOR[slug] ? "currentColor" : brand.hex;
      return (
        '<svg class="brand-icon" viewBox="0 0 24 24" width="20" height="20" fill="' + fill + '" aria-hidden="true">' +
        '<path d="' + brand.path + '"></path></svg>'
      );
    }
    return spriteIcon(SPRITE_FALLBACK[slug] || "globe");
  }

  function socialCardHTML(s) {
    return (
      '<a class="card social-card" href="' + s.url + '" target="_blank" rel="noopener noreferrer">' +
      '<div class="social-card__icon">' + iconMarkup(s) + "</div>" +
      "<div>" +
      '<div class="social-card__platform">' + escapeHTML(PLATFORM_LABEL[s.platform] || s.platform) + "</div>" +
      '<div class="social-card__handle">' + escapeHTML(s.handle || "") + "</div>" +
      "</div>" +
      "</a>"
    );
  }

  function footerSocialHTML(s) {
    return (
      '<a href="' + s.url + '" target="_blank" rel="noopener noreferrer" aria-label="' +
      escapeHTML((PLATFORM_LABEL[s.platform] || s.platform) + ": " + (s.handle || "")) + '">' +
      '<span class="footer-social-icon">' + iconMarkup(s) + "</span>" +
      escapeHTML(PLATFORM_LABEL[s.platform] || s.platform) +
      "</a>"
    );
  }

  function renderSocialsPage(socials) {
    var grid = document.querySelector("[data-socials-grid]");
    var emptyState = document.querySelector("[data-socials-empty]");
    if (!grid) return;

    if (!socials.length) {
      grid.hidden = true;
      if (emptyState) emptyState.hidden = false;
      return;
    }
    grid.hidden = false;
    if (emptyState) emptyState.hidden = true;
    grid.innerHTML = socials.map(socialCardHTML).join("");
  }

  function renderFooterSocials(socials) {
    var host = document.querySelector("[data-footer-socials]");
    if (!host) return;
    if (!socials.length) {
      host.innerHTML = '<span class="footer__empty-note">None added yet</span>';
      return;
    }
    host.innerHTML = socials.map(footerSocialHTML).join("");
  }

  function init() {
    var needsSocials = document.querySelector("[data-socials-grid], [data-footer-socials]");
    if (!needsSocials) return;

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load socials.json (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        var socials = data.socials || [];
        renderSocialsPage(socials);
        renderFooterSocials(socials);
      })
      .catch(function (err) {
        console.error("[Nexo Realm] socials.json:", err);
        renderFooterSocials([]);
        var emptyState = document.querySelector("[data-socials-empty]");
        if (emptyState) emptyState.hidden = false;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
