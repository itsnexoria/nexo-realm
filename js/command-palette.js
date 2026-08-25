/**
 * command-palette.js — global Ctrl/Cmd+K quick launcher.
 * Self-contained: injects its own trigger button into every page's nav
 * and its own markup into <body>, so no HTML changes were needed anywhere
 * except one <script> tag per page. Searches every site page, every
 * project (from /data/projects.json), and every social (from
 * /data/socials.json) in one place — the same data every other page
 * already renders from, so this can never drift out of sync.
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
  var IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function sprite(name) {
    return (
      '<svg class="icon" aria-hidden="true" width="16" height="16"><use href="' +
      ASSET_PREFIX + "icons/lucide-sprite.svg#" + name + '"></use></svg>'
    );
  }

  var PAGES = [
    { title: "Home", subtitle: "Back to the realm", href: ASSET_PREFIX || "./", iconName: "compass", keywords: "home start realm" },
    { title: "Projects", subtitle: "Browse every Nexo project", href: ASSET_PREFIX + "projects/", iconName: "layers", keywords: "projects browse all apps" },
    { title: "Socials", subtitle: "Follow along everywhere", href: ASSET_PREFIX + "socials/", iconName: "network", keywords: "socials follow discord youtube tiktok instagram twitch" },
    { title: "Showcase", subtitle: "Featured work", href: ASSET_PREFIX + "showcase/", iconName: "sparkles", keywords: "showcase featured highlights" },
    { title: "Changelog", subtitle: "What's new across the realm", href: ASSET_PREFIX + "changelog/", iconName: "list", keywords: "changelog updates news history" },
    { title: "About", subtitle: "The story behind the realm", href: ASSET_PREFIX + "about/", iconName: "briefcase", keywords: "about nexoria nexus story" }
  ];

  var state = { open: false, items: [], loaded: false, activeIndex: -1, lastFocused: null };
  var els = {};

  function buildMarkup() {
    var overlay = document.createElement("div");
    overlay.className = "cmdk-overlay";
    overlay.setAttribute("data-cmdk-overlay", "");
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<div class="cmdk-input-wrap">' +
          sprite("search") +
          '<input type="text" class="cmdk-input" role="combobox" aria-expanded="false" aria-controls="cmdk-listbox" aria-autocomplete="list" data-cmdk-input placeholder="Search projects, pages, socials\u2026" autocomplete="off" spellcheck="false" />' +
          '<button type="button" class="cmdk-close" data-cmdk-close aria-label="Close search">' + sprite("x") + "</button>" +
        "</div>" +
        '<div class="cmdk-results" id="cmdk-listbox" role="listbox" data-cmdk-results></div>' +
        '<div class="cmdk-footer">' +
          "<span><kbd>\u2191</kbd><kbd>\u2193</kbd> Navigate</span>" +
          "<span><kbd>\u21b5</kbd> Open</span>" +
          "<span><kbd>Esc</kbd> Close</span>" +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    els.overlay = overlay;
    els.input = overlay.querySelector("[data-cmdk-input]");
    els.results = overlay.querySelector("[data-cmdk-results]");
    els.closeBtn = overlay.querySelector("[data-cmdk-close]");

    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    els.closeBtn.addEventListener("click", close);
    els.input.addEventListener("input", function () { filter(els.input.value); });
    els.input.addEventListener("keydown", onInputKeydown);
  }

  function injectTriggers() {
    var kbdLabel = IS_MAC ? "\u2318K" : "Ctrl K";
    document.querySelectorAll(".nav__actions").forEach(function (bar) {
      if (bar.querySelector("[data-cmdk-trigger]")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cmdk-trigger";
      btn.setAttribute("data-cmdk-trigger", "");
      btn.setAttribute("aria-label", "Search the realm (" + kbdLabel + ")");
      btn.innerHTML =
        sprite("search") +
        '<span class="cmdk-trigger__label">Search</span>' +
        '<kbd class="cmdk-trigger__kbd">' + kbdLabel + "</kbd>";
      btn.addEventListener("click", open);
      bar.insertBefore(btn, bar.firstChild);
    });
  }

  function loadData() {
    if (state.loaded) return Promise.resolve();
    var projectsP = fetch(ASSET_PREFIX + "data/projects.json")
      .then(function (r) { return r.ok ? r.json() : { projects: [] }; })
      .catch(function () { return { projects: [] }; });
    var socialsP = fetch(ASSET_PREFIX + "data/socials.json")
      .then(function (r) { return r.ok ? r.json() : { socials: [] }; })
      .catch(function () { return { socials: [] }; });

    return Promise.all([projectsP, socialsP]).then(function (results) {
      var projects = results[0].projects || [];
      var socials = results[1].socials || [];
      var items = [];

      PAGES.forEach(function (p) {
        items.push({
          group: "Pages",
          title: p.title,
          subtitle: p.subtitle,
          iconHTML: sprite(p.iconName),
          href: p.href,
          external: false,
          keywords: (p.title + " " + p.subtitle + " " + p.keywords).toLowerCase()
        });
      });

      projects.forEach(function (p) {
        var isSoon = p.status === "soon";
        items.push({
          group: "Projects",
          title: p.name,
          subtitle: p.description || p.category || "",
          iconHTML: sprite(p.icon || "globe"),
          href: isSoon ? ASSET_PREFIX + "projects/" + p.id + "/" : p.url,
          external: !isSoon,
          keywords: [p.name, p.description, p.category, (p.tags || []).join(" ")].join(" ").toLowerCase()
        });
      });

      socials.forEach(function (s) {
        var slug = (s.icon || s.platform || "").toLowerCase();
        var brand = window.BRAND_ICONS && window.BRAND_ICONS[slug];
        var iconHTML = brand
          ? '<svg class="icon brand-icon" viewBox="0 0 24 24" width="16" height="16" fill="' + brand.hex + '" aria-hidden="true"><path d="' + brand.path + '"></path></svg>'
          : sprite("globe");
        items.push({
          group: "Socials",
          title: s.platform ? s.platform.charAt(0).toUpperCase() + s.platform.slice(1) : "Social",
          subtitle: s.handle || s.url || "",
          iconHTML: iconHTML,
          href: s.url,
          external: true,
          keywords: [s.platform, s.handle, s.url].join(" ").toLowerCase()
        });
      });

      state.items = items;
      state.loaded = true;
    });
  }

  function filter(query) {
    var q = query.trim().toLowerCase();
    var tokens = q.split(/\s+/).filter(Boolean);
    var list = !tokens.length
      ? state.items
      : state.items.filter(function (item) {
          return tokens.every(function (t) { return item.keywords.indexOf(t) !== -1; });
        });
    render(list, q);
  }

  function render(list, q) {
    if (!list.length) {
      els.results.innerHTML =
        '<div class="cmdk-empty">' + sprite("search") +
        "<p><strong>No matches for \u201c" + escapeHTML(q) + "\u201d.</strong></p>" +
        "<p>Try a project name, a page, or a platform.</p></div>";
      els.input.setAttribute("aria-expanded", "false");
      els.input.removeAttribute("aria-activedescendant");
      state.activeIndex = -1;
      return;
    }
    els.input.setAttribute("aria-expanded", "true");

    var groups = {};
    var order = [];
    list.forEach(function (item) {
      if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    });

    var html = "";
    var idx = 0;
    order.forEach(function (g) {
      html += '<div class="cmdk-group-label">' + escapeHTML(g) + "</div>";
      groups[g].forEach(function (item) {
        html +=
          '<div class="cmdk-item" role="option" id="cmdk-option-' + idx + '" data-cmdk-index="' + idx +
          '" data-href="' + escapeHTML(item.href) + '" data-external="' + item.external + '">' +
            '<span class="cmdk-item__icon">' + item.iconHTML + "</span>" +
            '<span class="cmdk-item__text"><span class="cmdk-item__title">' + escapeHTML(item.title) +
            '</span><span class="cmdk-item__subtitle">' + escapeHTML(item.subtitle || "") + "</span></span>" +
            (item.external ? sprite("arrow-up-right") : "") +
          "</div>";
        idx++;
      });
    });
    els.results.innerHTML = html;

    els.results.querySelectorAll(".cmdk-item").forEach(function (el) {
      el.addEventListener("mousemove", function () { setActive(parseInt(el.getAttribute("data-cmdk-index"), 10)); });
      el.addEventListener("mousedown", function (e) { e.preventDefault(); activate(el); });
    });

    setActive(0);
  }

  function setActive(index) {
    var itemEls = els.results.querySelectorAll(".cmdk-item");
    if (!itemEls.length) return;
    if (index < 0) index = itemEls.length - 1;
    if (index >= itemEls.length) index = 0;
    itemEls.forEach(function (el) { el.classList.remove("is-active"); el.setAttribute("aria-selected", "false"); });
    var target = itemEls[index];
    target.classList.add("is-active");
    target.setAttribute("aria-selected", "true");
    els.input.setAttribute("aria-activedescendant", target.id);
    target.scrollIntoView({ block: "nearest" });
    state.activeIndex = index;
  }

  function activate(el) {
    if (!el) return;
    var href = el.getAttribute("data-href");
    var external = el.getAttribute("data-external") === "true";
    close();
    if (!href) return;
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.href = href;
  }

  function onInputKeydown(e) {
    var itemEls = els.results.querySelectorAll(".cmdk-item");
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(state.activeIndex + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(state.activeIndex - 1); }
    else if (e.key === "Enter") { e.preventDefault(); activate(itemEls[state.activeIndex]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  function open() {
    if (state.open) return;
    state.open = true;
    state.lastFocused = document.activeElement;
    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { els.overlay.classList.add("is-open"); });
    els.input.value = "";
    if (!state.loaded) {
      els.results.innerHTML = '<div class="cmdk-empty">' + sprite("search") + "<p>Loading\u2026</p></div>";
    }
    loadData().then(function () { filter(""); });
    els.input.focus();
    document.addEventListener("keydown", onDocKeydown, true);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    els.overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onDocKeydown, true);
    setTimeout(function () { if (!state.open) els.overlay.hidden = true; }, 200);
    if (state.lastFocused && typeof state.lastFocused.focus === "function") state.lastFocused.focus();
  }

  function onDocKeydown(e) {
    if (e.key === "Escape") close();
  }

  function onGlobalKeydown(e) {
    var active = document.activeElement;
    var isTyping = active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);

    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      state.open ? close() : open();
      return;
    }
    if (e.key === "/" && !isTyping && !state.open) {
      e.preventDefault();
      open();
    }
  }

  function init() {
    buildMarkup();
    injectTriggers();
    document.addEventListener("keydown", onGlobalKeydown);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
