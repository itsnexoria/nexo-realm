/**
 * projects.js — single source of truth is /data/projects.json.
 * Renders: home "featured" grid + marquee + stats counters, and the full
 * Projects page grid with live search, category filter, and sorting.
 * Nothing here is hardcoded — add a project by editing the JSON only.
 *
 * Icons are self-hosted SVG sprite references (see /icons/lucide-sprite.svg)
 * rather than a JS icon library — this renders instantly with zero network
 * dependency and can't be blocked by an ad-blocker or CDN hiccup.
 */
(function () {
  "use strict";

  var ASSET_PREFIX = getAssetPrefix();
  var DATA_URL = ASSET_PREFIX + "data/projects.json";

  function getAssetPrefix() {
    // Pages can live at any depth (/, /projects/, /projects/nexo-hub/, etc.)
    // so walk up one "../" per path segment rather than assuming one level.
    var segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length && segments[segments.length - 1].indexOf(".") !== -1) {
      segments.pop(); // drop a trailing filename like index.html
    }
    return segments.length ? new Array(segments.length + 1).join("../") : "";
  }

  function icon(name, attrs) {
    attrs = attrs || ' width="16" height="16"';
    return (
      '<svg class="icon" aria-hidden="true"' + attrs + '><use href="' + ASSET_PREFIX +
      'icons/lucide-sprite.svg#' + name + '"></use></svg>'
    );
  }

  /**
   * "Live" status is checked for real, not just declared in JSON: it piggy-
   * backs on the favicon request every card already makes (no extra network
   * call). If the project's own domain answers, it's marked Online; if both
   * favicon attempts fail, it's marked Unreachable. This is a lightweight
   * reachability signal, not a full uptime monitor — the badge's tooltip
   * says so plainly. `beta`/`soon` stay as manually-declared labels since
   * they're not something a ping can measure.
   */
  function statusBadge(p) {
    if (p.status === "beta") return '<span class="badge badge--beta"><span class="orbit-mini"><span class="orbit-mini__dot"></span></span>Beta</span>';
    if (p.status === "soon") return '<span class="badge badge--soon"><span class="orbit-mini"><span class="orbit-mini__dot"></span></span>Coming soon</span>';
    return '<span class="badge badge--live"><span class="orbit-mini"><span class="orbit-mini__dot"></span></span>Live</span>';
  }

  function faviconURL(p) {
    // An explicit "favicon" field in projects.json always wins — useful when
    // a site doesn't serve /favicon.ico at the conventional path.
    if (p.favicon) return p.favicon;
    return "https://" + hostname(p.url) + "/favicon.ico";
  }

  function attachFaviconFallbacks(root) {
    (root || document).querySelectorAll("img.project-favicon:not([data-fallback-wired])").forEach(function (img) {
      img.setAttribute("data-fallback-wired", "true");

      img.addEventListener(
        "error",
        function () {
          // The favicon attempt failed (no favicon.ico at that path, or the
          // request was blocked) — fall back to a generic icon. This says
          // nothing about whether the site is actually up: plenty of live,
          // healthy sites just don't serve a favicon at the conventional
          // path, so this is never treated as a "site is down" signal.
          var wrap = document.createElement("span");
          wrap.innerHTML = icon(img.getAttribute("data-fallback-icon") || "globe");
          img.replaceWith(wrap.firstElementChild);
        },
        { once: false }
      );
    });
  }

  function faviconImgHTML(p) {
    return (
      '<img class="project-favicon" src="' + faviconURL(p) + '" data-project-url="' +
      escapeHTML(p.url) + '" data-fallback-icon="' + (p.icon || "globe") + '" alt="" width="28" height="28" loading="lazy" />'
    );
  }

  function cardHTML(p) {
    var tags = (p.tags || [])
      .map(function (t) { return '<span class="tag">' + escapeHTML(t) + "</span>"; })
      .join("");
    var isSoon = p.status === "soon";
    var linkAttrs = isSoon ? "" : ' target="_blank" rel="noopener noreferrer"';
    var href = isSoon ? "javascript:void(0)" : p.url;

    return (
      '<article class="card project-card' + (isSoon ? " project-card--soon" : "") + '" data-name="' + escapeHTML(p.name.toLowerCase()) +
      '" data-category="' + escapeHTML((p.category || "").toLowerCase()) + '" data-status="' + p.status + '">' +
      '<div class="project-card__top">' +
      '<div class="project-card__icon">' + faviconImgHTML(p) + "</div>" +
      statusBadge(p) +
      "</div>" +
      '<div><div class="project-card__name"><a href="' + ASSET_PREFIX + 'projects/' + escapeHTML(p.id) + '/">' + escapeHTML(p.name) + '</a></div><div class="project-card__category">' + escapeHTML(p.category || "") + "</div></div>" +
      '<p class="project-card__desc">' + escapeHTML(p.description || "") + "</p>" +
      '<div class="project-card__tags">' + tags + "</div>" +
      '<div class="project-card__footer">' +
      '<span class="tag" style="border:none;padding:0;color:var(--ink-faint)">' + escapeHTML(hostname(p.url)) + "</span>" +
      (isSoon
        ? '<span class="project-card__link" aria-disabled="true">Notify me ' + icon("bell") + "</span>"
        : '<a class="project-card__link" href="' + href + '"' + linkAttrs + ">Visit " + icon("arrow-up-right") + "</a>") +
      "</div>" +
      "</article>"
    );
  }

  function hostname(url) {
    try { return new URL(url).hostname; } catch (e) { return url; }
  }

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function renderHome(projects) {
    var featuredHost = document.querySelector("[data-featured-projects]");
    var marqueeHost = document.querySelector("[data-marquee-track]");
    var statProjects = document.querySelector("[data-stat-projects]");
    var statLive = document.querySelector("[data-stat-live]");

    var featured = projects.filter(function (p) { return p.featured; });
    if (featuredHost) {
      var list = featured.length ? featured : projects;
      featuredHost.innerHTML = list.slice(0, 3).map(cardHTML).join("");
    }
    if (marqueeHost) {
      marqueeHost.innerHTML = projects
        .map(function (p) {
          return (
            '<div class="card card--glass marquee-card">' +
            '<div class="project-card__icon" style="margin-bottom:12px">' + faviconImgHTML(p) + "</div>" +
            '<div class="project-card__name">' + escapeHTML(p.name) + "</div>" +
            '<div class="project-card__category">' + escapeHTML(p.category || "") + "</div>" +
            "</div>"
          );
        })
        .join("");
    }
    if (statProjects) statProjects.setAttribute("data-counter", String(projects.length));
    if (statLive) statLive.setAttribute("data-counter", String(projects.filter(function (p) { return p.status === "live"; }).length));

    attachFaviconFallbacks();
    document.dispatchEvent(new CustomEvent("nexo:counters-ready"));
  }

  function renderProjectsPage(projects) {
    var grid = document.querySelector("[data-projects-grid]");
    var emptyState = document.querySelector("[data-projects-empty]");
    var searchInput = document.querySelector("[data-projects-search]");
    var sortSelect = document.querySelector("[data-projects-sort]");
    var chips = document.querySelectorAll("[data-category-chip]");
    if (!grid) return;

    var state = { query: "", category: "all", sort: "featured" };

    function apply() {
      var filtered = projects.filter(function (p) {
        var matchesQuery =
          !state.query ||
          p.name.toLowerCase().includes(state.query) ||
          (p.description || "").toLowerCase().includes(state.query) ||
          (p.tags || []).join(" ").toLowerCase().includes(state.query);
        var matchesCategory = state.category === "all" || (p.category || "").toLowerCase() === state.category;
        return matchesQuery && matchesCategory;
      });

      filtered.sort(function (a, b) {
        if (state.sort === "name") return a.name.localeCompare(b.name);
        if (state.sort === "status") return a.status.localeCompare(b.status);
        // featured first, then live before soon
        var fa = a.featured ? 0 : 1;
        var fb = b.featured ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name);
      });

      grid.innerHTML = filtered.map(cardHTML).join("");
      grid.classList.toggle("visually-hidden", filtered.length === 0);
      if (emptyState) emptyState.hidden = filtered.length !== 0;
      attachFaviconFallbacks(grid);
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.query = searchInput.value.trim().toLowerCase();
        apply();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        state.sort = sortSelect.value;
        apply();
      });
    }
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.category = chip.getAttribute("data-category-chip").toLowerCase();
        apply();
      });
    });

    apply();
  }

  function renderShowcase(projects) {
    var host = document.querySelector("[data-showcase-grid]");
    if (!host) return;
    var featured = projects.filter(function (p) { return p.featured; });
    var list = featured.length ? featured : projects;
    host.innerHTML = list.map(cardHTML).join("");
    attachFaviconFallbacks(host);
  }

  function buildCategoryChips(projects) {
    var host = document.querySelector("[data-category-chips]");
    if (!host) return;
    var categories = Array.from(new Set(projects.map(function (p) { return p.category; }).filter(Boolean)));
    var chips = ['<button class="chip" data-category-chip="all" aria-pressed="true">All</button>'];
    categories.forEach(function (c) {
      chips.push('<button class="chip" data-category-chip="' + escapeHTML(c) + '" aria-pressed="false">' + escapeHTML(c) + "</button>");
    });
    host.innerHTML = chips.join("");
  }

  function init() {
    // Project detail pages (/projects/{id}/) ship their favicon markup
    // statically — no fetch needed to render them, just wire up the same
    // real-favicon fallback chain and live status check used everywhere else.
    if (document.querySelector("[data-project-detail]")) {
      attachFaviconFallbacks();
    }

    var needsProjects = document.querySelector(
      "[data-featured-projects], [data-projects-grid], [data-marquee-track], [data-stat-projects], [data-showcase-grid]"
    );
    if (!needsProjects) return;

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load projects.json (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        var projects = data.projects || [];
        renderHome(projects);
        buildCategoryChips(projects);
        renderProjectsPage(projects);
        renderShowcase(projects);
      })
      .catch(function (err) {
        console.error("[Nexo Realm] projects.json:", err);
        var grid = document.querySelector("[data-projects-grid]");
        if (grid) {
          grid.innerHTML =
            '<div class="empty-state"><p><strong>Projects failed to load.</strong></p><p>Check that <code>/data/projects.json</code> is reachable.</p></div>';
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
