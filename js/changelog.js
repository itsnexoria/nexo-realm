/**
 * changelog.js — single source of truth is /data/changelog.json.
 * Ships empty on purpose (see its "_documentation" key) — nothing here is
 * invented. Renders the full timeline on /changelog/ and a short "Latest
 * updates" strip on Home, both from the same data.
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
  var DATA_URL = ASSET_PREFIX + "data/changelog.json";

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function tagsHTML(tags) {
    return (tags || []).map(function (t) { return '<span class="tag">' + escapeHTML(t) + "</span>"; }).join("");
  }

  function timelineItemHTML(entry) {
    return (
      '<div class="timeline__item">' +
      '<div class="timeline__date">' + escapeHTML(formatDate(entry.date)) + "</div>" +
      '<h4 class="timeline__title">' + escapeHTML(entry.title) + "</h4>" +
      '<p class="timeline__desc">' + escapeHTML(entry.description || "") + "</p>" +
      '<div class="timeline__tags">' + tagsHTML(entry.tags) + "</div>" +
      "</div>"
    );
  }

  function updateCardHTML(entry) {
    return (
      '<div class="card update-card">' +
      '<div class="update-card__date">' + escapeHTML(formatDate(entry.date)) + "</div>" +
      '<h4>' + escapeHTML(entry.title) + "</h4>" +
      '<p class="lede" style="margin-top:.5rem;">' + escapeHTML(entry.description || "") + "</p>" +
      "</div>"
    );
  }

  function renderChangelogPage(entries) {
    var host = document.querySelector("[data-changelog-timeline]");
    var emptyState = document.querySelector("[data-changelog-empty]");
    if (!host) return;

    if (!entries.length) {
      host.hidden = true;
      if (emptyState) emptyState.hidden = false;
      return;
    }
    host.hidden = false;
    if (emptyState) emptyState.hidden = true;
    host.innerHTML = entries.map(timelineItemHTML).join("");
  }

  function renderHomeStrip(entries) {
    var host = document.querySelector("[data-updates-strip]");
    var section = document.querySelector("[data-updates-section]");
    if (!host) return;

    if (!entries.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    host.innerHTML = entries.slice(0, 3).map(updateCardHTML).join("");
  }

  function init() {
    var needsChangelog = document.querySelector("[data-changelog-timeline], [data-updates-strip]");
    if (!needsChangelog) return;

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load changelog.json (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        // Newest first, regardless of the order they're written in the file.
        var entries = (data.entries || []).slice().sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
        renderChangelogPage(entries);
        renderHomeStrip(entries);
      })
      .catch(function (err) {
        console.error("[Nexo Realm] changelog.json:", err);
        var emptyState = document.querySelector("[data-changelog-empty]");
        if (emptyState) emptyState.hidden = false;
        var section = document.querySelector("[data-updates-section]");
        if (section) section.hidden = true;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
