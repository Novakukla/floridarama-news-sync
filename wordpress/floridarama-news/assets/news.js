(function () {
  "use strict";

  const FILTERS = [
    ["spotlight", "Spotlight"],
    ["local", "Local News Features"],
    ["nation", "National News Features"],
    ["international", "International"]
  ];
  const STRIP_COLORS = ["#ff4fa3", "#29b6f6", "#35d07f", "#ffd84d", "#ff8a3d"];
  const CARD_COLORS = ["#ff4fa3", "#29b6f6", "#35d07f", "#ff8a3d"];

  function stableHash(input) {
    let hash = 0;
    const value = String(input || "");
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function host(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function youtubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\/+/, "");
      if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
    } catch (error) {
      return null;
    }
    return null;
  }

  function youtubeThumb(url) {
    const id = youtubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
  }

  function cardThumb(item) {
    return item.thumb || (item.type === "video" ? youtubeThumb(item.url) : "");
  }

  function cardColor(index) {
    return CARD_COLORS[Math.abs(index || 0) % CARD_COLORS.length];
  }

  function stripColor(item) {
    return STRIP_COLORS[stableHash(item.url || item.title) % STRIP_COLORS.length];
  }

  function sortLocalGroups(groups) {
    return groups.sort(([a], [b]) => {
      const aNum = /^\d/.test(a.trim());
      const bNum = /^\d/.test(b.trim());
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  function renderCard(item, index) {
    const isVideo = item.type === "video";
    const thumb = cardThumb(item);
    const title = escapeHtml(item.title || host(item.url));
    const source = escapeHtml(item.source || host(item.url));
    const description = escapeHtml(item.description || "");
    const tag = escapeHtml(item.tag || (isVideo ? "Video" : "Article"));
    const url = escapeHtml(item.url || "");
    const itemHost = escapeHtml(host(item.url));
    const style = `--fr-card-fill: ${cardColor(index)};${item.type === "article" ? ` --fr-strip: ${stripColor(item)};` : ""}`;
    const thumbHtml = thumb
      ? `<img class="fr-news__thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy">`
      : `<span class="fr-news__thumb--empty" aria-hidden="true"></span>`;
    const playHtml = isVideo
      ? `<span class="fr-news__play" aria-hidden="true"><span class="fr-news__play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></span></span>`
      : "";
    const action = isVideo
      ? `<button class="fr-news__button" type="button" data-fr-action="play" data-fr-url="${url}" data-fr-title="${title}">Play</button>`
      : `<a class="fr-news__button" href="${url}" target="_blank" rel="noopener noreferrer">Read</a>`;
    const linkAttrs = isVideo
      ? `href="${url}" data-fr-action="play" data-fr-url="${url}" data-fr-title="${title}"`
      : `href="${url}" target="_blank" rel="noopener noreferrer"`;

    return `
      <article class="fr-news__card" data-type="${escapeHtml(item.type)}" style="${style}">
        <a class="fr-news__card-link" ${linkAttrs} aria-label="${isVideo ? "Play" : "Open"} ${title}">
          ${thumbHtml}
          ${playHtml}
        </a>
        <div class="fr-news__card-body">
          <div class="fr-news__meta">
            <span class="fr-news__tag">${tag}</span>
            <span class="fr-news__source" title="${source}">${source}</span>
          </div>
          <h3 class="fr-news__headline">${title}</h3>
          ${description ? `<p class="fr-news__description">${description}</p>` : ""}
          <div class="fr-news__actions">
            ${action}
            <span class="fr-news__host">${itemHost}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderCards(items) {
    if (!items.length) return `<p class="fr-news__empty">No news items are available for this filter yet.</p>`;
    return `<div class="fr-news__masonry" role="list">${items.map(renderCard).join("")}</div>`;
  }

  function renderLocalLinks(localLinks) {
    const groups = sortLocalGroups(Object.entries(localLinks || {}));
    if (!groups.length) return "";
    return `
      <div class="fr-news__local-groups" role="list">
        ${groups.map(([source, links], index) => `
          <section class="fr-news__group" role="listitem" style="--fr-card-fill: ${cardColor(index)};">
            <h3 class="fr-news__group-title">${escapeHtml(source)}</h3>
            <div class="fr-news__group-links">
              ${(links || []).map((link) => `
                <a class="fr-news__group-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(link.title || link.url)}
                </a>
              `).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    `;
  }

  function filteredItems(data, filter) {
    const items = Array.isArray(data.items) ? data.items : [];
    if (filter === "spotlight") return items.filter((item) => item.spotlight);
    return items.filter((item) => item.group === filter);
  }

  function modalHtml() {
    return `
      <div class="fr-news__modal" aria-hidden="true">
        <div class="fr-news__modal-panel" role="dialog" aria-modal="true" aria-label="Video player">
          <div class="fr-news__modal-top">
            <p class="fr-news__modal-title"></p>
            <button class="fr-news__modal-close" type="button">Close</button>
          </div>
          <div class="fr-news__player"></div>
        </div>
      </div>
    `;
  }

  function buildShell(root, data) {
    const showHeader = root.dataset.showHeader !== "false";
    const showTip = root.dataset.showTip !== "false";
    root.innerHTML = `
      ${showHeader ? `
        <div class="fr-news__header">
          <div>
            <h2 class="fr-news__title">News &amp; Media</h2>
            <p class="fr-news__subtitle">Press, features, and video coverage of FloridaRAMA.</p>
          </div>
        </div>
      ` : ""}
      <div class="fr-news__tabs" role="tablist" aria-label="News filters">
        ${FILTERS.map(([key, label]) => `<button class="fr-news__tab" type="button" role="tab" data-fr-filter="${key}" aria-selected="false">${label}</button>`).join("")}
      </div>
      <div class="fr-news__grid" aria-live="polite"></div>
      ${showTip ? `<p class="fr-news__tip">Tip: click a video card to play it, or open any article in a new tab.</p>` : ""}
      ${modalHtml()}
    `;
    root.__frNewsData = data;
  }

  function render(root, filter) {
    const data = root.__frNewsData || { items: [], localLinks: {} };
    const active = FILTERS.some(([key]) => key === filter) ? filter : "spotlight";
    root.querySelectorAll(".fr-news__tab").forEach((button) => {
      const selected = button.dataset.frFilter === active;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });

    const grid = root.querySelector(".fr-news__grid");
    const cards = renderCards(filteredItems(data, active));
    grid.innerHTML = active === "local" ? `${cards}${renderLocalLinks(data.localLinks)}` : cards;
  }

  function openVideo(root, url, title, opener) {
    const id = youtubeId(url);
    if (!id) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const modal = root.querySelector(".fr-news__modal");
    const titleEl = root.querySelector(".fr-news__modal-title");
    const player = root.querySelector(".fr-news__player");
    root.__frLastOpener = opener;
    titleEl.textContent = title || "Video player";
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="${escapeHtml(title || "FloridaRAMA video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    modal.setAttribute("aria-hidden", "false");
    root.querySelector(".fr-news__modal-close").focus();
  }

  function closeVideo(root) {
    const modal = root.querySelector(".fr-news__modal");
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;
    root.querySelector(".fr-news__player").innerHTML = "";
    modal.setAttribute("aria-hidden", "true");
    if (root.__frLastOpener && typeof root.__frLastOpener.focus === "function") {
      root.__frLastOpener.focus();
    }
  }

  function bind(root) {
    root.addEventListener("error", (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.classList.contains("fr-news__thumb")) return;
      const fallback = document.createElement("span");
      fallback.className = "fr-news__thumb--empty";
      fallback.setAttribute("aria-hidden", "true");
      image.replaceWith(fallback);
    }, true);

    root.addEventListener("click", (event) => {
      const tab = event.target.closest(".fr-news__tab");
      if (tab && root.contains(tab)) {
        render(root, tab.dataset.frFilter);
        return;
      }

      const play = event.target.closest("[data-fr-action='play']");
      if (play && root.contains(play)) {
        event.preventDefault();
        openVideo(root, play.dataset.frUrl, play.dataset.frTitle, play);
        return;
      }

      if (event.target.closest(".fr-news__modal-close") || event.target.classList.contains("fr-news__modal")) {
        closeVideo(root);
      }
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeVideo(root);
      if (!event.target.classList.contains("fr-news__tab")) return;
      const tabs = Array.from(root.querySelectorAll(".fr-news__tab"));
      const index = tabs.indexOf(event.target);
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      next.focus();
      render(root, next.dataset.frFilter);
    });
  }

  async function init(root) {
    if (root.__frNewsReady) return;
    root.__frNewsReady = true;
    const url = root.dataset.newsUrl;
    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      buildShell(root, data);
      bind(root);
      render(root, root.dataset.defaultFilter || "spotlight");
    } catch (error) {
      root.querySelector(".fr-news__fallback").textContent = "FloridaRAMA news is temporarily unavailable. Please check back soon.";
    }
  }

  function initAll() {
    document.querySelectorAll(".fr-news").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll, { once: true });
  } else {
    initAll();
  }
})();
