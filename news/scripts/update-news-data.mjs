#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.resolve(__dirname, "../data/news-items.json");
const REQUEST_DELAY_MS = 650;
const FETCH_TIMEOUT_MS = 12000;

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");
const refreshTitles = args.has("--refresh-titles");
const refreshThumbs = args.has("--refresh-thumbs");
const dataArg = process.argv.find((arg) => arg.startsWith("--data="));
const dataFile = dataArg ? path.resolve(dataArg.slice("--data=".length)) : DEFAULT_DATA_FILE;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableId(item) {
  const source = item.source || hostname(item.url) || "news";
  const label = `${source} ${item.title || item.url || "item"}`;
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

function normalizeText(value) {
  if (value == null) return value;
  return String(value)
    .replaceAll("â€™", "’")
    .replaceAll("â€˜", "‘")
    .replaceAll("â€œ", "“")
    .replaceAll("â€�", "”")
    .replaceAll("â€“", "–")
    .replaceAll("â€”", "—")
    .replaceAll("â€¦", "…")
    .replaceAll("Â ", " ")
    .replaceAll("Â", "")
    .replace(/\s+/g, " ")
    .trim();
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

function isBlockedTitle(title) {
  return /^(verifying device|just a moment)\b/i.test(title)
    || /checking your browser|attention required|access denied|forbidden|captcha|enable javascript/i.test(title);
}

function isBlockedHtml(html) {
  return /cf-browser-verification|cloudflare|checking your browser|access denied|captcha/i.test(html.slice(0, 5000));
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

function extractTitle(html) {
  const og = extractMeta(html, "property", "og:title") || extractMeta(html, "name", "twitter:title");
  if (og) return cleanTitle(og);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? cleanTitle(title) : "";
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

function cleanTitle(title) {
  const cleaned = decodeHtmlEntities(title).replace(/\s+-\s+YouTube$/i, "").trim();
  return cleaned && !isBlockedTitle(cleaned) ? cleaned : "";
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

async function fetchYouTubeOEmbed(url) {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(endpoint, { redirect: "follow" });
  if (!response.ok) return {};
  const data = await response.json();
  return {
    title: cleanTitle(data.title || ""),
    thumb: data.thumbnail_url || youtubeThumb(url)
  };
}

async function fetchPageMetadata(url) {
  const ytId = extractYouTubeId(url);
  if (ytId) return await fetchYouTubeOEmbed(url);

  const response = await fetchWithTimeout(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; FloridaRAMA-NewsSync/1.0; +https://floridarama.art/)",
      accept: "text/html,application/xhtml+xml"
    }
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) return { note: `HTTP ${response.status}` };
  if (!contentType.toLowerCase().includes("text/html")) return { note: `Non-HTML ${contentType}` };

  const html = await response.text();
  if (isBlockedHtml(html)) return { note: "blocked/bot-check page ignored" };
  return {
    title: extractTitle(html),
    thumb: extractImage(html, url),
    description: extractDescription(html)
  };
}

function applyItemMetadata(item, metadata, summary) {
  item.id = item.id || stableId(item);
  item.title = normalizeText(item.title || "");
  item.source = normalizeText(item.source || hostname(item.url));
  item.tag = normalizeText(item.tag || (item.type === "video" ? "Video" : "Press"));
  item.group = item.group || "local";
  item.description = normalizeText(item.description || "");

  if (metadata.title && (!item.title || refreshTitles)) {
    if (item.title !== metadata.title) summary.titles++;
    item.title = metadata.title;
    item.id = stableId(item);
  }
  if (metadata.thumb && (!item.thumb || refreshThumbs)) {
    if (item.thumb !== metadata.thumb) summary.thumbs++;
    item.thumb = metadata.thumb;
  }
  if (!item.thumb && item.type === "video") {
    const thumb = youtubeThumb(item.url);
    if (thumb) {
      item.thumb = thumb;
      summary.thumbs++;
    }
  }
  if (metadata.description && !item.description) {
    item.description = metadata.description;
    summary.descriptions++;
  }
}

async function main() {
  if (typeof fetch !== "function") throw new Error("Node 18+ is required.");

  const raw = await fs.readFile(dataFile, "utf8");
  const data = JSON.parse(raw);
  const previousUpdatedAt = data.updatedAt;
  const summary = { checked: 0, titles: 0, thumbs: 0, descriptions: 0, localTitles: 0, failed: 0 };

  for (const item of data.items || []) {
    if (!item.url) continue;
    process.stdout.write(`item: ${item.url}\n`);
    try {
      const metadata = await fetchPageMetadata(item.url);
      applyItemMetadata(item, metadata, summary);
      if (metadata.note) process.stdout.write(`  note: ${metadata.note}\n`);
    } catch (error) {
      summary.failed++;
      process.stdout.write(`  failed: ${error.message}\n`);
    }
    summary.checked++;
    await sleep(REQUEST_DELAY_MS);
  }

  for (const [source, links] of Object.entries(data.localLinks || {})) {
    for (const link of links || []) {
      link.title = normalizeText(link.title);
      if (!link.url || link.title) continue;
      process.stdout.write(`local link (${source}): ${link.url}\n`);
      try {
        const metadata = await fetchPageMetadata(link.url);
        if (metadata.title) {
          link.title = metadata.title;
          summary.localTitles++;
        } else if (metadata.note) {
          process.stdout.write(`  note: ${metadata.note}\n`);
        }
      } catch (error) {
        summary.failed++;
        process.stdout.write(`  failed: ${error.message}\n`);
      }
      summary.checked++;
      await sleep(REQUEST_DELAY_MS);
    }
  }

  data.updatedAt = previousUpdatedAt;
  const candidateJson = `${JSON.stringify(data, null, 2)}\n`;
  const hasChanges = candidateJson !== raw;
  if (hasChanges) data.updatedAt = new Date().toISOString();
  const nextJson = `${JSON.stringify(data, null, 2)}\n`;
  console.log(`\nChecked ${summary.checked} URLs.`);
  console.log(`Updates: ${summary.titles} item titles, ${summary.thumbs} thumbs, ${summary.descriptions} descriptions, ${summary.localTitles} local link titles.`);
  if (summary.failed) console.log(`Failures: ${summary.failed} URLs kept existing data.`);

  if (!shouldWrite) {
    console.log("Dry run only. Re-run with --write to save changes.");
    return;
  }

  if (!hasChanges) {
    console.log("No file changes.");
    return;
  }
  await fs.writeFile(dataFile, nextJson, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), dataFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
