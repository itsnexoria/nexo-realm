(() => {
  "use strict";

  const METADATA_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h client-side cache
  const STATUS_CACHE_TTL = 2 * 60 * 1000; // 2min client-side cache
  const projects = NEXORIA_PROJECTS.filter((p) => !p.self);
  // Projects with a live URL worth polling for uptime — excludes anything
  // marked status:"development" (unreleased software has no "online" to check).
  const liveProjects = projects.filter((p) => p.status !== "development");

  // -------------------------------------------------------
  // tiny helpers
  // -------------------------------------------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  const initials = (name) => {
    const words = name.trim().split(/\s+/);
    if (words.length > 1) {
      return words
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }
    // single word (e.g. "NexoSites", "BloxCore") — fall back to the
    // internal capital letters so it still reads as two letters
    // instead of shrinking to a single, sparser-looking initial.
    const word = words[0] || "";
    const caps = word.match(/[A-Z]/g);
    if (caps && caps.length > 1) return caps.slice(0, 2).join("").toUpperCase();
    return word.slice(0, 2).toUpperCase();
  };

  function readCache(key, ttl) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > ttl) return null;
      return data;
    } catch {
      return null;
    }
  }
  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      /* storage full or unavailable — degrade silently */
    }
  }

  // -------------------------------------------------------
  // nav
  // -------------------------------------------------------
  function initNav() {
    const nav = $(".nav");
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = $(".nav-toggle");
    const menu = $(".mobile-menu");
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
    });
    $$(".mobile-menu a").forEach((a) =>
      a.addEventListener("click", () => {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
      })
    );
  }

  // -------------------------------------------------------
  // scroll reveal
  // -------------------------------------------------------
  function initReveal() {
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window) || !els.length) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  // -------------------------------------------------------
  // stats count-up
  // -------------------------------------------------------
  function initStats() {
    const grid = $("#stats-grid");
    if (!grid) return;
    getEcosystemStats().forEach((stat) => {
      const el = document.createElement("div");
      el.className = "stat reveal";
      const valueEl = document.createElement("div");
      valueEl.className = "stat-value";
      if (stat.isText) {
        valueEl.innerHTML = `<span class="accent">${stat.value}</span>`;
      } else {
        valueEl.innerHTML = `<span class="accent count-target" data-target="${stat.value}">0</span>${stat.suffix}`;
      }
      const labelEl = document.createElement("div");
      labelEl.className = "stat-label";
      labelEl.textContent = stat.label;
      el.append(valueEl, labelEl);
      grid.appendChild(el);
    });

    const targets = $$(".count-target", grid);
    if (!targets.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (el) => {
      const target = parseInt(el.dataset.target, 10);
      if (reduceMotion || !target) {
        el.textContent = target || el.textContent;
        return;
      }
      const start = performance.now();
      const duration = 900;
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    targets.forEach((t) => io.observe(t));
  }

  // -------------------------------------------------------
  // orbit field — position project nodes around the hero rings
  // -------------------------------------------------------
  function initOrbit() {
    const svg = $("#orbit-field");
    if (!svg) return;
    const ringGroup = $("#orbit-nodes", svg);
    const cx = 700,
      cy = 700;
    // Radii deliberately sit OUTSIDE the readable hero column (headline +
    // description + buttons occupy roughly the center 700px), so these
    // stay pure ambient decoration and never collide with real copy.
    // No text labels here — this is a background effect, not a second nav.
    const radii = [560, 660];
    const items = projects.slice(0, 6);
    items.forEach((p, i) => {
      const radius = radii[i % radii.length];
      const angle = (i / items.length) * Math.PI * 2 + 0.35;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "orbit-node");
      g.setAttribute("transform", `translate(${x}, ${y})`);
      g.innerHTML = `
        <circle class="glow" r="6"></circle>
        <circle class="core" r="3"></circle>
      `;
      ringGroup.appendChild(g);
    });
  }

  // In-page quick-launch panel in the hero — lets visitors jump straight to
  // a project without scrolling, without being an actual slide-out drawer.
  function initHeroNavPanel() {
    const list = $("#hero-nav-list");
    if (!list) return;
    const items = projects.slice(0, 8);

    items.forEach((project) => {
      const a = document.createElement("a");
      a.className = "hero-nav-link";
      a.href = project.type === "software" ? project.githubUrl || project.url : project.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.innerHTML = `
        <span class="hero-nav-link-row">
          <span class="hero-nav-link-icon" aria-hidden="true"><span class="fallback">${initials(project.name)}</span></span>
          <span class="hero-nav-link-text">
            <span class="name">${project.name}</span>
            <span class="category">${project.category}</span>
          </span>
          <span class="dot checking" data-role="dot"></span>
          <svg class="hero-nav-link-arrow" width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M3 10L10 3M10 3H4.5M10 3V8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="hero-nav-link-desc">${project.description || "No description available yet."}</span>
      `;
      list.appendChild(a);

      const dot = $('[data-role="dot"]', a);
      wireStatusIndicator(project, dot, null);
      // Deliberately NOT using real favicons/logos here — this row is only
      // 26px tall, and detailed marks (fetched favicons or our own 3D
      // software logos) turn into unrecognizable color smudges at that
      // size. A clean two-letter monogram reads reliably at any size, so
      // it's used consistently for every row instead.
    });

    // live "X/Y online" counter in the panel header, same honest logic as
    // the ecosystem status panel — never claims a project is down when a
    // check simply couldn't be reached
    const countEl = $("#hero-nav-count");
    if (countEl) {
      const states = new Map();
      liveProjects.forEach((project) => {
        subscribeStatus(project.url, (data) => {
          states.set(project.url, data.online);
          const values = Array.from(states.values());
          if (values.length < liveProjects.length) return;
          const { dotClass } = summarizeStatus(values, liveProjects.length);
          const online = values.filter((v) => v === true).length;
          const dot = $(".dot", countEl);
          const labelEl = $("[data-role='label']", countEl);
          dot.classList.remove("online", "offline", "checking", "unknown");
          dot.classList.add(dotClass);
          labelEl.textContent = dotClass === "unknown" ? "Unavailable" : `${online}/${liveProjects.length} online`;
        });
      });
    }
  }

  // -------------------------------------------------------
  // status check (shared by nav badge, status panel, cards)
  // -------------------------------------------------------
  const statusListeners = new Map(); // url -> Set(callback)
  const statusCache = new Map();

  function subscribeStatus(url, cb) {
    if (!statusListeners.has(url)) statusListeners.set(url, new Set());
    statusListeners.get(url).add(cb);
    const cached = readCache(`nexo-status:${url}`, STATUS_CACHE_TTL);
    if (cached) {
      cb(cached);
    } else {
      fetchStatus(url);
    }
  }

  async function fetchStatus(url) {
    try {
      const res = await fetch(`/api/status?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const data = res.ok ? await res.json() : { online: null };
      writeCache(`nexo-status:${url}`, data);
      statusCache.set(url, data);
      (statusListeners.get(url) || []).forEach((cb) => cb(data));
    } catch {
      const data = { online: null };
      (statusListeners.get(url) || []).forEach((cb) => cb(data));
    }
  }

  function applyDotState(dotEl, textEl, data) {
    dotEl.classList.remove("online", "offline", "checking", "unknown");
    if (data.online === true) {
      dotEl.classList.add("online");
      if (textEl) textEl.textContent = "Online";
    } else if (data.online === false) {
      dotEl.classList.add("offline");
      if (textEl) textEl.textContent = "Offline";
    } else {
      // status genuinely couldn't be determined (backend unreachable, e.g.
      // a static preview without the Pages Functions running) — this is
      // NOT the same as confirmed-down, so it never claims "Offline".
      dotEl.classList.add("unknown");
      if (textEl) textEl.textContent = "Unknown";
    }
  }

  // Summarize a set of online states into a single honest headline.
  // Never reports "down" for a project we simply failed to reach.
  function summarizeStatus(values, total) {
    const online = values.filter((v) => v === true).length;
    const offline = values.filter((v) => v === false).length;
    const unknown = values.filter((v) => v === null || v === undefined).length;
    if (unknown === total) return { dotClass: "unknown", label: "STATUS UNAVAILABLE" };
    if (online === total) return { dotClass: "online", label: "ALL SYSTEMS OPERATIONAL" };
    if (offline > 0) return { dotClass: "offline", label: `${online}/${total} ONLINE` };
    return { dotClass: "checking", label: `${online}/${total} ONLINE` };
  }

  // Wires a status dot for any project — live sites subscribe to the real
  // uptime check; unreleased software (status:"development") gets a static
  // "In development" badge instead, since there's no "online" to check.
  function wireStatusIndicator(project, dotEl, textEl) {
    if (project.status === "development") {
      dotEl.classList.remove("online", "offline", "checking", "unknown");
      dotEl.classList.add("building");
      if (textEl) textEl.textContent = "In development";
      return;
    }
    subscribeStatus(project.url, (data) => applyDotState(dotEl, textEl, data));
  }

  // -------------------------------------------------------
  // metadata fetch (title/description/favicon/og:image)
  // -------------------------------------------------------
  async function fetchMetadata(project) {
    const cached = readCache(`nexo-meta:${project.url}`, METADATA_CACHE_TTL);
    if (cached) return cached;
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(project.url)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      writeCache(`nexo-meta:${project.url}`, data);
      return data;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------
  // project cards
  // -------------------------------------------------------
  function cardTemplate(project) {
    if (project.type === "software") return softwareCardTemplate(project);

    const card = document.createElement("article");
    card.className = "card reveal";
    card.dataset.category = project.category;
    card.dataset.name = project.name.toLowerCase();
    card.dataset.desc = (project.description || "").toLowerCase();

    const thumbHtml = thumbMarkup(project);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon" aria-hidden="true">
          ${iconMarkup(project)}
        </div>
        <span class="card-category">${project.category}</span>
      </div>
      ${thumbHtml}
      <div class="card-body">
        <h3 class="card-name">
          ${project.name}
          <span class="status-pill"><span class="dot checking" data-role="dot"></span></span>
        </h3>
        <p class="card-desc${project.description ? "" : " is-loading"}" data-role="desc">${project.description || ""}</p>
      </div>
      <div class="card-foot">
        <span class="card-url">${hostOf(project.url)}</span>
        <span class="card-visit">
          Visit
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M3 10L10 3M10 3H4.5M10 3V8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <a class="card-link-cover" href="${project.url}" target="_blank" rel="noopener noreferrer">
        <span class="sr-only">Open ${project.name} — ${hostOf(project.url)}</span>
      </a>
    `;

    const dot = $('[data-role="dot"]', card);
    wireStatusIndicator(project, dot, null);

    const descEl = $('[data-role="desc"]', card);
    const iconEl = $(".card-icon", card);
    fetchMetadata(project).then((meta) => {
      descEl.classList.remove("is-loading");
      if (!project.description && meta && meta.description) {
        // only fall back to the auto-fetched description when we don't
        // already have a hand-written one — a curated description is
        // more trustworthy than whatever a site's <meta> tag says.
        descEl.textContent = meta.description;
        card.dataset.desc = meta.description.toLowerCase();
      } else if (!project.description && !meta?.description) {
        descEl.textContent = "No description available yet.";
      }
      if (meta && meta.favicon) {
        const img = new Image();
        img.onload = () => {
          iconEl.innerHTML = "";
          img.alt = "";
          img.loading = "lazy";
          iconEl.appendChild(img);
        };
        img.onerror = () => {};
        img.src = meta.favicon;
      }
    });

    return card;
  }

  // Software cards skip the live "online/offline" model entirely — they
  // show version/platform tags, a static build-state badge, and explicit
  // links (GitHub / Download / Docs) instead of a single whole-card link,
  // since a repo isn't "visited" the way a website is.
  function iconMarkup(project) {
    return project.icon ? `<img src="${project.icon}" alt="" loading="lazy" />` : `<span class="fallback">${initials(project.name)}</span>`;
  }

  const EXPAND_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function thumbMarkup(project) {
    if (!project.image) return "";
    return `
      <div class="card-thumb">
        <img src="${project.image}" alt="" loading="lazy" width="960" height="540" />
        <button type="button" class="thumb-expand" data-lightbox-src="${project.image}" data-lightbox-caption="${project.name}" aria-label="View a larger preview of ${project.name}">
          ${EXPAND_ICON}
        </button>
      </div>
    `;
  }

  function softwareCardTemplate(project) {
    const card = document.createElement("article");
    card.className = "card reveal";
    card.dataset.category = project.category;
    card.dataset.name = project.name.toLowerCase();
    card.dataset.desc = (project.description || "").toLowerCase();

    const tags = [project.version, project.platform].filter(Boolean);
    const tagsHtml = tags.length ? `<div class="card-tags">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : "";

    const primaryUrl = project.githubUrl || project.url;
    const extraLinks = [];
    if (project.githubUrl) extraLinks.push({ label: "GitHub", url: project.githubUrl });
    if (project.downloadUrl) extraLinks.push({ label: "Download", url: project.downloadUrl });
    if (project.docsUrl) extraLinks.push({ label: "Docs", url: project.docsUrl });
    const extraLinksHtml = extraLinks.length
      ? `<div class="card-extra-links">${extraLinks
          .map((l) => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`)
          .join("")}</div>`
      : "";

    const thumbHtml = thumbMarkup(project);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon" aria-hidden="true">
          ${iconMarkup(project)}
        </div>
        <span class="card-category">${project.category}</span>
      </div>
      ${thumbHtml}
      <div class="card-body">
        <h3 class="card-name">
          ${project.name}
          <span class="status-pill"><span class="dot checking" data-role="dot"></span><span data-role="status-text"></span></span>
        </h3>
        <p class="card-desc" data-role="desc">${project.description || "No description available yet."}</p>
        ${tagsHtml}
      </div>
      <div class="card-foot">
        ${extraLinksHtml || `<span class="card-url">${hostOf(primaryUrl)}</span>`}
      </div>
      <a class="card-link-cover" href="${primaryUrl}" target="_blank" rel="noopener noreferrer">
        <span class="sr-only">Open ${project.name} on GitHub</span>
      </a>
    `;

    const dot = $('[data-role="dot"]', card);
    const statusText = $('[data-role="status-text"]', card);
    wireStatusIndicator(project, dot, statusText);

    return card;
  }

  function renderProjects(list, container) {
    container.innerHTML = "";
    if (!list.length) {
      container.classList.add("is-empty");
      container.innerHTML = `
        <div class="empty-state">
          <strong>No projects match that search</strong>
          Try a different keyword or clear the filters.
        </div>`;
      return;
    }
    container.classList.remove("is-empty");
    list.forEach((p) => container.appendChild(cardTemplate(p)));
    initReveal();
  }

  function initProjectGrid() {
    const container = $("#project-grid");
    if (!container) return;
    const rest = projects.filter((p) => !p.featured);
    renderProjects(rest, container);

    // search + filter
    const searchInput = $("#project-search");
    const filterWrap = $("#category-filters");
    const categories = ["All", ...new Set(projects.map((p) => p.category))];
    categories.forEach((cat, i) => {
      const btn = document.createElement("button");
      btn.className = "filter-pill";
      btn.type = "button";
      btn.textContent = cat;
      btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      btn.addEventListener("click", () => {
        $$(".filter-pill", filterWrap).forEach((b) => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        applyFilters();
      });
      filterWrap.appendChild(btn);
    });

    function applyFilters() {
      const activeCat = $('.filter-pill[aria-pressed="true"]', filterWrap)?.textContent || "All";
      const q = searchInput.value.trim().toLowerCase();
      const filtered = rest.filter((p) => {
        const matchesCat = activeCat === "All" || p.category === activeCat;
        const matchesQ =
          !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        return matchesCat && matchesQ;
      });
      renderProjects(filtered, container);
    }

    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(applyFilters, 150);
    });
  }

  // -------------------------------------------------------
  // featured projects (cinematic slot)
  // -------------------------------------------------------
  function initFeatured() {
    const wrap = $("#featured-wrap");
    if (!wrap) return;
    const featured = projects.filter((p) => p.featured);
    featured.forEach((project) => {
      const el = document.createElement("div");
      el.className = "featured reveal";
      el.innerHTML = `
        <div class="featured-content">
          <span class="eyebrow featured-eyebrow">${project.category}</span>
          <h3 class="featured-name">${project.name}</h3>
          <p class="featured-desc" data-role="desc">${project.description || "Loading description…"}</p>
          <div class="featured-meta">
            <span class="status-pill"><span class="dot checking" data-role="dot"></span><span data-role="status-text">Checking</span></span>
            <span class="card-url">${hostOf(project.url)}</span>
            <a class="btn btn-ghost" href="${project.url}" target="_blank" rel="noopener noreferrer">
              Visit ${project.name}
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M3 10L10 3M10 3H4.5M10 3V8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>
        </div>
        <div class="featured-visual" data-role="visual">
          <div class="browser-bar"><span></span><span></span><span></span></div>
          <span class="placeholder-mark">${initials(project.name)}</span>
          <button type="button" class="thumb-expand" data-role="expand" data-lightbox-caption="${project.name}" aria-label="View a larger preview of ${project.name}" hidden>
            ${EXPAND_ICON}
          </button>
        </div>
      `;
      wrap.appendChild(el);

      const dot = $('[data-role="dot"]', el);
      const statusText = $('[data-role="status-text"]', el);
      wireStatusIndicator(project, dot, statusText);

      const expandBtn = $('[data-role="expand"]', el);
      const revealExpand = (src) => {
        expandBtn.dataset.lightboxSrc = src;
        expandBtn.hidden = false;
      };

      // A hand-set image wins immediately — no need to wait on a fetch,
      // and it's more trustworthy than whatever a page's og:image happens
      // to be set to.
      const visual = $('[data-role="visual"]', el);
      if (project.image) {
        const img = new Image();
        img.onload = () => {
          const existing = $(".placeholder-mark", visual);
          if (existing) existing.remove();
          img.alt = "";
          img.loading = "lazy";
          visual.appendChild(img);
          revealExpand(project.image);
        };
        img.src = project.image;
      }

      fetchMetadata(project).then((meta) => {
        if (!meta) return;
        if (!project.description && meta.description) $('[data-role="desc"]', el).textContent = meta.description;
        if (!project.image && meta.image) {
          const img = new Image();
          img.onload = () => {
            const existing = $(".placeholder-mark", visual);
            if (existing) existing.remove();
            img.alt = "";
            img.loading = "lazy";
            visual.appendChild(img);
            revealExpand(meta.image);
          };
          img.src = meta.image;
        }
      });
    });
    initReveal();
  }

  // -------------------------------------------------------
  // status panel (full ecosystem status section)
  // -------------------------------------------------------
  function initStatusPanel() {
    const rows = $("#status-rows");
    const headPill = $("#status-headline");
    if (!rows) return;

    const states = new Map();
    projects.forEach((project) => {
      const row = document.createElement("div");
      row.className = "status-row";
      row.innerHTML = `
        <span class="status-row-name"><span class="dot checking" data-role="dot"></span>${project.name}</span>
        <span class="status-row-meta" data-role="text">Checking</span>
      `;
      rows.appendChild(row);
      const dot = $('[data-role="dot"]', row);
      const text = $('[data-role="text"]', row);

      if (project.status === "development") {
        wireStatusIndicator(project, dot, text); // static badge, doesn't affect the aggregate headline
        return;
      }
      subscribeStatus(project.url, (data) => {
        applyDotState(dot, text, data);
        states.set(project.url, data.online);
        updateHeadline();
      });
    });

    function updateHeadline() {
      const values = Array.from(states.values());
      if (values.length < liveProjects.length) return; // wait for all live (non-dev) projects to report
      const { dotClass, label } = summarizeStatus(values, liveProjects.length);
      const dot = $(".dot", headPill);
      dot.classList.remove("online", "offline", "checking", "unknown");
      dot.classList.add(dotClass);
      headPill.lastChild.textContent =
        dotClass === "unknown" ? " Status unavailable — checks aren't reachable right now" : ` ${label.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}`;
    }
  }

  // -------------------------------------------------------
  // socials
  // -------------------------------------------------------
  const ICONS = {
    discord: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20.3 5.4A18 18 0 0015.6 4l-.3.6a13 13 0 013.9 1.5 15.9 15.9 0 00-14.4 0A13 13 0 018.7 4.6L8.4 4a18 18 0 00-4.7 1.4C1.3 9 .6 12.6 1 16a17.7 17.7 0 005.3 2.7l.9-1.3a11.6 11.6 0 01-1.8-.9l.4-.3a12.6 12.6 0 0010.4 0l.4.3c-.6.4-1.2.6-1.8.9l.9 1.3A17.7 17.7 0 0023 16c.5-3.9-.5-7.5-2.7-10.6zM8.9 13.8c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8zm6.2 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8z" fill="currentColor"/></svg>',
    github: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 015 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v2.9c0 .3.2.6.7.5A10 10 0 0012 2z" fill="currentColor"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18.9 3H22l-7.6 8.6L23 21h-6.9l-5.4-6.6L4.5 21H1.4l8.1-9.2L1 3h7l4.9 6 5.9-6z" fill="currentColor"/></svg>',
    instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>',
    youtube: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor"/></svg>',
    twitch: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 2L2.5 6v13H7v3l3-3h3.5L19 14V2H4zm13 11l-2.5 2.5H11L8.5 18v-2.5H5V4h12v9z" fill="currentColor"/><rect x="9" y="7" width="1.6" height="4.5" fill="var(--surface)"/><rect x="13" y="7" width="1.6" height="4.5" fill="var(--surface)"/></svg>',
    tiktok: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M16.5 2c.4 2.4 2 4 4.5 4.2v3.1c-1.6 0-3-.5-4.5-1.4v6.8a6.4 6.4 0 11-6.4-6.4c.3 0 .6 0 .9.1v3.2a3.2 3.2 0 103.2 3.2V2h2.3z" fill="currentColor"/></svg>',
  };

  function initSocials() {
    const grid = $("#social-grid");
    if (!grid) return;
    NEXORIA_SOCIALS.forEach((s) => {
      const a = document.createElement("a");
      a.className = "social-card";
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.innerHTML = `
        <span class="social-icon">${ICONS[s.icon] || ""}</span>
        <span class="social-meta">
          <span class="social-name">${s.name}</span>
          <span class="social-handle">${s.handle || ""}</span>
        </span>
      `;
      grid.appendChild(a);
    });
  }

  // Compact icon-only social row in the nav, replacing the old status
  // pill + Explore button — same NEXORIA_SOCIALS source as the full grid
  // in the Socials section, just the first few so the header stays tidy.
  function initNavSocials() {
    const wrap = $("#nav-socials");
    if (!wrap) return;
    NEXORIA_SOCIALS.slice(0, 4).forEach((s) => {
      const a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", s.name);
      a.innerHTML = ICONS[s.icon] || "";
      wrap.appendChild(a);
    });
  }

  // -------------------------------------------------------
  // currently building
  // -------------------------------------------------------
  function initBuilding() {
    const el = $("#building-card");
    if (!el || !NEXORIA_CURRENTLY_BUILDING?.title) return;
    $("#building-title", el).textContent = NEXORIA_CURRENTLY_BUILDING.title;
    if (NEXORIA_CURRENTLY_BUILDING.note) $("#building-note", el).textContent = NEXORIA_CURRENTLY_BUILDING.note;
    el.hidden = false;
  }

  // -------------------------------------------------------
  // ecosystem-wide status summary — drives both the nav pill and
  // the hero badge from the same live data, so neither ever claims
  // "online" without a real check backing it up.
  // -------------------------------------------------------
  function initNavStatus() {
    // #nav-status-pill was removed from the header in favor of the social
    // icons row — this now only drives the hero badge, filtered gracefully.
    const pills = [$("#nav-status-pill"), $("#hero-status-pill")].filter(Boolean);
    if (!pills.length) return;
    const states = new Map();
    liveProjects.forEach((project) => {
      subscribeStatus(project.url, (data) => {
        states.set(project.url, data.online);
        const values = Array.from(states.values());
        if (values.length < liveProjects.length) return;
        const { dotClass, label } = summarizeStatus(values, liveProjects.length);
        pills.forEach((pill) => {
          const dot = $(".dot", pill);
          const labelEl = $("[data-role='label']", pill);
          dot.classList.remove("online", "offline", "checking", "unknown");
          dot.classList.add(dotClass);
          labelEl.textContent = dotClass === "unknown" ? "STATUS UNAVAILABLE" : label === "ALL SYSTEMS OPERATIONAL" ? "ECOSYSTEM ONLINE" : label;
        });
      });
    });
  }

  // -------------------------------------------------------
  // lightbox — enlarges any preview screenshot on click
  // -------------------------------------------------------
  function initLightbox() {
    const lightbox = $("#lightbox");
    const img = $("#lightbox-img");
    const caption = $("#lightbox-caption");
    const closeBtn = $("#lightbox-close");
    if (!lightbox || !img) return;

    function open(src, captionText) {
      img.src = src;
      img.alt = captionText || "";
      caption.textContent = captionText || "";
      lightbox.hidden = false;
      // next frame, so the hidden->visible transition actually animates
      requestAnimationFrame(() => lightbox.classList.add("is-open"));
      document.body.classList.add("menu-open"); // reuses the existing scroll-lock style
      closeBtn.focus();
    }

    function close() {
      lightbox.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      setTimeout(() => {
        lightbox.hidden = true;
        img.src = "";
      }, 250);
    }

    // event delegation — works for every current AND future
    // [data-lightbox-src] trigger (cards render asynchronously)
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-lightbox-src]");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      open(trigger.dataset.lightboxSrc, trigger.dataset.lightboxCaption);
    });

    closeBtn.addEventListener("click", close);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("is-open")) close();
    });
  }

  function initFooter() {
    const y = $("#footer-year");
    if (y) y.textContent = new Date().getFullYear();
  }

  // -------------------------------------------------------
  // micro-interactions — skipped entirely under prefers-reduced-motion
  // -------------------------------------------------------
  const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HAS_FINE_POINTER = window.matchMedia("(pointer: fine)").matches;

  // Cursor-reactive ambient glow in the hero — a subtle radial highlight
  // that follows the pointer, layered under the content.
  function initHeroCursorGlow() {
    if (REDUCE_MOTION || !HAS_FINE_POINTER) return;
    const hero = $(".hero");
    if (!hero) return;
    const glow = document.createElement("div");
    glow.className = "hero-cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    hero.appendChild(glow);
    hero.addEventListener("pointermove", (e) => {
      const rect = hero.getBoundingClientRect();
      glow.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      glow.style.setProperty("--my", `${e.clientY - rect.top}px`);
      glow.style.opacity = "1";
    });
    hero.addEventListener("pointerleave", () => {
      glow.style.opacity = "0";
    });
  }

  // Magnetic pull — the button drifts slightly toward the cursor within a
  // small radius, and snaps back on leave. A light-touch version, not a
  // dramatic one.
  function initMagneticButtons() {
    if (REDUCE_MOTION || !HAS_FINE_POINTER) return;
    $$(".btn-primary, .btn-ghost").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.18 - 2}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "";
      });
    });
  }

  // Subtle tilt on project cards — follows the pointer within the card,
  // combined with the existing hover-lift.
  function initCardTilt() {
    if (REDUCE_MOTION || !HAS_FINE_POINTER) return;
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest?.(".card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(800px) translateY(-4px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg)`;
    });
    document.addEventListener(
      "pointerout",
      (e) => {
        const card = e.target.closest?.(".card");
        if (card && !card.contains(e.relatedTarget)) card.style.transform = "";
      },
      true
    );
  }

  // Highlights the nav link for whichever section is currently in view.
  function initScrollSpy() {
    const sections = ["projects", "status", "about", "socials"].map((id) => $(`#${id}`)).filter(Boolean);
    const links = $$(".nav-links a, .mobile-menu a");
    if (!sections.length || !links.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          links.forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#${id}`));
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => io.observe(s));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initOrbit();
    initHeroNavPanel();
    initStats();
    initFeatured();
    initProjectGrid();
    initStatusPanel();
    initSocials();
    initNavSocials();
    initBuilding();
    initNavStatus();
    initFooter();
    initLightbox();
    initReveal();
    initHeroCursorGlow();
    initMagneticButtons();
    initCardTilt();
    initScrollSpy();
  });
})();
