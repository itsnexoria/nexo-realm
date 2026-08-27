/**
 * NEXORIA — Ecosystem configuration
 * ----------------------------------
 * This is the ONLY file you should need to edit to add, remove, or
 * reorder projects and socials. Everything else (metadata, status,
 * card rendering) is derived automatically from what's below.
 *
 * To add a project you only truly need: name, url, category.
 * Every other field is optional — leave it out and the site will
 * either fetch it automatically (title/description/favicon/og:image
 * via /api/metadata) or fall back to a sensible default.
 */

// ---------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------
// type:     "website" | "software" | "tool" | "service"
// category: any short label — also drives the filter pills below
// featured: true puts it in the large cinematic slot up top
// status:   leave unset to let the live status checker decide.
//           set to "development" to permanently show a build badge
//           instead of an online/offline dot (e.g. unreleased software).
//
// Software-only fields (type: "software"):
//   version     — short label shown as a tag, e.g. "v0.4" or "Early build"
//   platform    — short label shown as a tag, e.g. "Windows · Linux"
//   githubUrl   — repo link; also used as the click-through if set
//   downloadUrl — direct download/release link, shown as its own button
//   docsUrl     — documentation link, shown as its own button
// Only the ones you actually set are rendered — no field is required.
const NEXORIA_PROJECTS = [
  {
    id: "nexorealm",
    name: "Nexoria",
    url: "https://nexorealm.org",
    category: "Hub",
    type: "website",
    description: "The command center for the whole ecosystem — you're on it.",
    self: true, // hide from grid + status checks, it's this site
  },
  {
    id: "nexo-boost",
    name: "Nexo Boost",
    url: "https://boost.nexorealm.org",
    category: "Tools",
    type: "tool",
    description: "Boosting and optimization utility.",
    featured: true,
  },
  {
    id: "nexosites",
    name: "NexoSites",
    url: "https://nexosites.xyz",
    category: "Websites",
    type: "website",
    description: "A wider network of web projects and experiments.",
  },
  {
    id: "watch-log",
    name: "Watch Log",
    url: "https://list.nexosites.xyz",
    category: "Tracking",
    type: "tool",
    description: "A watch and log style tracking project.",
  },
  {
    id: "bloxcore",
    name: "BloxCore",
    url: "https://blox.nexorealm.org",
    category: "Gaming",
    type: "website",
    description: "Blox Fruits trading value database, built for the community.",
    aliases: ["https://bloxcores.xyz"],
    featured: true,
  },
  {
    id: "nexo-hub",
    name: "Nexo Hub",
    url: "https://app.nexorealm.org",
    category: "Directory",
    type: "website",
    description: "A curated directory of the web — hundreds of sites and tools, organized.",
    featured: true,
  },
  {
    id: "nexo-dev",
    name: "Nexo Dev",
    url: "https://github.com/itsnexoria/nexo-dev",
    category: "Software",
    type: "software",
    description: "A custom Electron + Monaco code editor — multi-terminal tabs, integrated Git, and a built-in GitHub panel.",
    platform: "Windows · Linux",
    githubUrl: "https://github.com/itsnexoria/nexo-dev",
    // downloadUrl: "https://github.com/itsnexoria/nexo-dev/releases", // uncomment once a public release exists
    // docsUrl: "https://...", // add if/when docs go up
    status: "development", // shows a static "In development" badge instead of a live online/offline check
  },
];

// ---------------------------------------------------------------
// SOCIALS
// ---------------------------------------------------------------
const NEXORIA_SOCIALS = [
  { name: "Discord", handle: "Join the server", url: "https://discord.gg/NTFhj44pXR", icon: "discord" },
  { name: "GitHub", handle: "itsnexoria", url: "https://github.com/itsnexoria", icon: "github" },
  { name: "X", handle: "@itsnexoria", url: "https://x.com/itsnexoria", icon: "x" },
  { name: "Instagram", handle: "@itsnexoria", url: "https://instagram.com/itsnexoria", icon: "instagram" },
  { name: "YouTube", handle: "@itsnexoria", url: "https://youtube.com/@itsnexoria", icon: "youtube" },
  { name: "Twitch", handle: "@nxrealm08", url: "https://twitch.tv/nxrealm08", icon: "twitch" },
  { name: "TikTok", handle: "@nxrealm08", url: "https://tiktok.com/@nxrealm08", icon: "tiktok" },
];

const NEXORIA_CONTACT = {
  email: "support@nexorealm.org",
};

// ---------------------------------------------------------------
// STATS — only meaningful, non-vanity numbers
// ---------------------------------------------------------------
function getEcosystemStats() {
  const live = NEXORIA_PROJECTS.filter((p) => !p.self);
  const categories = new Set(live.map((p) => p.category)).size;
  return [
    { value: live.length, suffix: "+", label: "Projects" },
    { value: categories, suffix: "", label: "Categories" },
    { value: "24/7", suffix: "", label: "Building", isText: true },
    { value: "∞", suffix: "", label: "Ideas", isText: true },
  ];
}

// ---------------------------------------------------------------
// CURRENTLY BUILDING — small, hand-edited, optional
// ---------------------------------------------------------------
const NEXORIA_CURRENTLY_BUILDING = {
  title: "",
  note: "",
};

if (typeof module !== "undefined") {
  module.exports = { NEXORIA_PROJECTS, NEXORIA_SOCIALS, NEXORIA_CONTACT, getEcosystemStats, NEXORIA_CURRENTLY_BUILDING };
}
