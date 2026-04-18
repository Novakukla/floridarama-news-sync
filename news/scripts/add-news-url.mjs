#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/news-items.json");
const RULES_FILE = path.resolve(__dirname, "../data/source-rules.json");
const FETCH_TIMEOUT_MS = 12000;

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");

function argValue(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

const inputUrl = argValue("--url");
const inputGroup = argValue("--group", "auto");
const inputType = argValue("--type", "auto");
const inputSpotlight = args.includes("--spotlight") || argValue("--spotlight", "false") === "true";

function normalizeText(value) {
  if (value == null) return "";
  let text = String(value);
  const replacements = new Map([
    ["\u00e2\u20ac\u2122", "\u2019"],
    ["\u00e2\u20ac\u02dc", "\u2018"],
    ["\u00e2\u20ac\u0153", "\u201c"],
    ["\u00e2\u20ac\ufffd", "\u201d"],
    ["\u00e2\u20ac\u201c", "\u2013"],
    ["\u00e2\u20ac\u201d", "\u2014"],
    ["\u00e2\u20ac\u00a6", "\u2026"],
    ["\u00c3\u00a9", "\u00e9"],
    ["\u00c3\u00a1", "\u00e1"],
    ["\u00c3\u00ad", "\u00ed"],
    ["\u00c3\u00b3", "\u00f3"],
    ["\u00c3\u00ba", "\u00fa"],
    ["\u00c3\u00b1", "\u00f1"],
    ["\u00c2 ", " "],
    ["\u00c2", ""]
  ]);
  for (const [bad, good] of replacements) text = text.replaceAll(bad, good);
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return normalizeText(String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'"));
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function absolutize(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.hostname.includes("youtube.com") && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      parsed.search = videoId ? `?v=${videoId}` : "";
    }
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return String(url || "").trim();
  }
}

function isBlockedTitle(title) {
  return /^(verifying device|just a moment)\b/i.test(title)
    || /checking your browser|attention required|access denied|forbidden|captcha|enable javascript/i.test(title);
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\/+/, "");
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

function youtubeThumb(url) {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

function cleanTitle(title) {
  const cleaned = decodeHtmlEntities(title).replace(/\s+-\s+YouTube$/i, "").trim();
  return cleaned && !isBlockedTitle(cleaned) ? cleaned : "";
}

function extractMeta(html, attrName, attrValue) {
  const patterns = [
    new RegExp(`<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${attrValue}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]);
  }
  return "";
}

function extractTitle(html) {
  return cleanTitle(
    extractMeta(html, "property", "og:title")
      || extractMeta(html, "name", "twitter:title")
      || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || ""
  );
}

function extractDescription(html) {
  return cleanTitle(
    extractMeta(html, "property", "og:description")
      || extractMeta(html, "name", "description")
      || extractMeta(html, "name", "twitter:description")
      || ""
  );
}

function extractImage(html, pageUrl) {
  const image = extractMeta(html, "property", "og:image")
    || extractMeta(html, "name", "twitter:image")
    || html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1]
    || "";
  return image ? absolutize(decodeHtmlEntities(image), pageUrl) : "";
}

function stableId(item) {
  const label = `${item.source || hostname(item.url) || "news"} ${item.title || item.url}`;
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "news-item";
  const hash = crypto.createHash("sha1").update(item.url || label).digest("hex").slice(0, 8);
  return `${slug.replace(/-+$/g, "")}-${hash}`;
}

function titleCaseDomain(host) {
  const base = host.split(".").slice(0, -1).join(".") || host;
  return base
    .split(/[.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYouTubeMetadata(url) {
  const response = await fetchWithTimeout(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  if (!response.ok) return {};
  const data = await response.json();
  return {
    title: cleanTitle(data.title || ""),
    source: "YouTube",
    thumb: data.thumbnail_url || youtubeThumb(url),
    description: "Video coverage featuring FloridaRAMA."
  };
}

async function fetchPageMetadata(url) {
  if (extractYouTubeId(url)) return await fetchYouTubeMetadata(url);

  const response = await fetchWithTimeout(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; FloridaRAMA-NewsSync/1.0; +https://floridarama.art/)",
      accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) return { note: `HTTP ${response.status}` };
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return { note: `Non-HTML ${contentType}` };

  const html = await response.text();
  return {
    title: extractTitle(html),
    source: extractMeta(html, "property", "og:site_name") || titleCaseDomain(hostname(url)),
    thumb: extractImage(html, url),
    description: extractDescription(html)
  };
}

function normalizeGroup(group) {
  const value = String(group || "auto").trim().toLowerCase();
  if (value === "nation" || value === "national") return "national";
  if (value === "international") return "international";
  if (value === "local") return "local";
  return "auto";
}

function domainMatches(host, domains = []) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function classifyGroup(url, metadata, rules) {
  const host = hostname(url).toLowerCase();
  const haystack = `${url} ${metadata.title || ""} ${metadata.source || ""} ${metadata.description || ""}`.toLowerCase();

  if (domainMatches(host, rules.international?.domains || [])) return "international";
  if ((rules.international?.tlds || []).some((tld) => host.endsWith(tld))) return "international";
  if (domainMatches(host, rules.local?.domains || [])) return "local";
  if ((rules.local?.keywords || []).some((keyword) => haystack.includes(keyword.toLowerCase()))) return "local";
  if (domainMatches(host, rules.national?.domains || [])) return "national";

  return "national";
}

function normalizeType(type, url) {
  const value = String(type || "auto").trim().toLowerCase();
  if (value === "article" || value === "video") return value;
  if (extractYouTubeId(url)) return "video";
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/video/") || parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      return "video";
    }
  } catch {
    // ignore
  }
  return "article";
}

function ensureLists(data) {
  data.lists ||= {};
  for (const key of ["spotlight", "local", "national", "international"]) {
    if (!Array.isArray(data.lists[key])) data.lists[key] = [];
  }
}

function prependUnique(list, id) {
  const next = [id, ...list.filter((existing) => existing !== id)];
  list.splice(0, list.length, ...next);
}

function removeFromList(list, id) {
  const next = list.filter((existing) => existing !== id);
  list.splice(0, list.length, ...next);
}

async function main() {
  if (typeof fetch !== "function") throw new Error("Node 18+ is required.");
  if (!inputUrl) throw new Error("Missing --url.");

  const url = new URL(inputUrl).toString();
  const data = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  const rules = JSON.parse(await fs.readFile(RULES_FILE, "utf8"));
  const previousUpdatedAt = data.updatedAt;
  const before = `${JSON.stringify(data, null, 2)}\n`;
  const metadata = await fetchPageMetadata(url);
  const group = normalizeGroup(inputGroup) === "auto" ? classifyGroup(url, metadata, rules) : normalizeGroup(inputGroup);
  const type = normalizeType(inputType, url);
  const normalized = normalizeUrl(url);
  const existing = (data.items || []).find((item) => normalizeUrl(item.url) === normalized);

  ensureLists(data);

  let item = existing;
  if (!item) {
    item = {
      id: "",
      type,
      group,
      tag: type === "video" ? "Video" : "Press",
      title: metadata.title || hostname(url),
      source: metadata.source || titleCaseDomain(hostname(url)),
      url,
      thumb: metadata.thumb || (type === "video" ? youtubeThumb(url) : ""),
      description: metadata.description || (type === "video" ? "Video coverage featuring FloridaRAMA." : "")
    };
    if (inputSpotlight) item.spotlight = true;
    item.id = stableId(item);
    data.items ||= [];
    data.items.unshift(item);
  } else {
    item.group = group;
    item.type = type;
    item.tag = item.tag || (type === "video" ? "Video" : "Press");
    item.title ||= metadata.title || hostname(url);
    item.source ||= metadata.source || titleCaseDomain(hostname(url));
    item.thumb ||= metadata.thumb || (type === "video" ? youtubeThumb(url) : "");
    item.description ||= metadata.description || "";
    if (inputSpotlight) item.spotlight = true;
  }

  for (const key of ["local", "national", "international"]) removeFromList(data.lists[key], item.id);
  prependUnique(data.lists[group], item.id);
  if (item.spotlight) prependUnique(data.lists.spotlight, item.id);

  data.updatedAt = previousUpdatedAt;
  const candidate = `${JSON.stringify(data, null, 2)}\n`;
  const hasChanges = candidate !== before;
  if (hasChanges) data.updatedAt = new Date().toISOString();
  const after = `${JSON.stringify(data, null, 2)}\n`;
  console.log(`${existing ? "Updated existing" : "Added"} ${item.type}: ${item.title}`);
  console.log(`Group: ${group}${item.spotlight ? " | Spotlight" : ""}`);

  if (!shouldWrite) {
    console.log("Dry run only. Re-run with --write to save changes.");
    return;
  }

  if (!hasChanges) {
    console.log("No data changes.");
    return;
  }

  await fs.writeFile(DATA_FILE, after, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), DATA_FILE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
