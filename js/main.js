/**
 * main.js — shared interactive behavior for every page:
 * sticky nav state, mobile menu, scroll-reveal, animated counters,
 * button ripple, back-to-top, nav status pill, and the hero boot line.
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Sticky nav border on scroll ---------- */
  function initNavScrollState() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  function initMobileMenu() {
    var btn = document.querySelector("[data-menu-toggle]");
    var menu = document.querySelector("[data-mobile-menu]");
    if (!btn || !menu) return;

    function close() {
      menu.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
    function open() {
      menu.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }

    btn.addEventListener("click", function () {
      var isOpen = menu.classList.contains("is-open");
      isOpen ? close() : open();
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", close);
    });

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  /* ---------- Scroll reveal ---------- */
  function initScrollReveal() {
    var targets = document.querySelectorAll(".reveal, .reveal-stagger");
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (t) { t.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach(function (t) { observer.observe(t); });
  }

  /* ---------- Animated counters ---------- */
  function initCounters() {
    var counters = document.querySelectorAll("[data-counter]");
    if (!counters.length) return;

    function animate(el) {
      var target = parseFloat(el.getAttribute("data-counter"));
      if (isNaN(target)) return;
      var suffix = el.getAttribute("data-suffix") || "";
      if (reduceMotion) {
        el.textContent = target.toLocaleString() + suffix;
        return;
      }
      var duration = 1400;
      var start = null;

      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = Math.round(eased * target);
        el.textContent = value.toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.setAttribute("data-counter-seen", "true");
              animate(entry.target);
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 }
      );
      counters.forEach(function (c) { observer.observe(c); });
    } else {
      counters.forEach(function (c) { c.setAttribute("data-counter-seen", "true"); animate(c); });
    }

    // Project count / live count start as placeholders in the markup and
    // only get their real value once projects.json loads (projects.js
    // dispatches this once it has). If the counter already animated to the
    // placeholder by then, re-run it now that data-counter holds the real
    // number — otherwise the hero would permanently read "0 Projects".
    document.addEventListener("nexo:counters-ready", function () {
      document.querySelectorAll("[data-stat-projects][data-counter-seen], [data-stat-live][data-counter-seen]").forEach(animate);
    });
  }

  /* ---------- Button ripple ---------- */
  function initRipple() {
    document.querySelectorAll(".btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        if (reduceMotion) return;
        var rect = btn.getBoundingClientRect();
        var ripple = document.createElement("span");
        var size = Math.max(rect.width, rect.height) * 1.4;
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
        ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", function () { ripple.remove(); });
      });
    });
  }

  /* ---------- Back to top ---------- */
  function initBackToTop() {
    document.querySelectorAll("[data-back-to-top]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }

  /* ---------- Current year in footer ---------- */
  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------- Nav status pill ----------
     A small "systems online" readout injected next to the wordmark on
     every page — the console idea announcing itself in the one spot
     everyone looks at first. Injected via JS (like the command palette
     trigger) so every page picks it up from one shared script. */
  function initNavStatusPill() {
    document.querySelectorAll(".nav__brand").forEach(function (brand) {
      if (brand.querySelector(".nav__status")) return;
      var pill = document.createElement("span");
      pill.className = "nav__status";
      pill.innerHTML = '<span class="nav__status-dot"></span>All systems online';
      brand.appendChild(pill);
    });
  }

  /* ---------- Hero boot line ----------
     Types out a single status line once on load, then leaves a blinking
     cursor. Skips straight to the finished line under reduced motion. */
  function initBootLine() {
    var el = document.querySelector("[data-boot-line]");
    if (!el) return;
    var text = el.getAttribute("data-boot-line") || "";
    var cursor = document.createElement("span");
    cursor.className = "boot-line__cursor";

    if (reduceMotion) {
      el.textContent = text;
      el.appendChild(cursor);
      return;
    }

    var i = 0;
    el.textContent = "";
    el.appendChild(cursor);
    (function type() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        el.appendChild(cursor);
        i++;
        setTimeout(type, 18 + Math.random() * 22);
      }
    })();
  }

  function init() {
    initNavScrollState();
    initMobileMenu();
    initScrollReveal();
    initCounters();
    initRipple();
    initBackToTop();
    initYear();
    initNavStatusPill();
    initBootLine();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
