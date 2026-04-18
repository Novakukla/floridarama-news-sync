# FloridaRAMA News Sync

This repo separates the old Wix-embedded news page into two maintainable deliverables:

1. A JSON-backed news data pipeline in `news/`.
2. A WordPress shortcode plugin in `wordpress/floridarama-news/`.

The legacy Wix file is not required by this repo. Its feature-card data and local grouped links have been converted into `news/data/news-items.json`.

## Data Pipeline

Dry run:

```sh
node news/scripts/update-news-data.mjs
```

Write updates:

```sh
node news/scripts/update-news-data.mjs --write
```

The script reads `news/data/news-items.json`, fetches missing metadata, fills YouTube thumbnails/titles through oEmbed, avoids obvious bot-check titles, and preserves curated descriptions and thumbnails by default.

The JSON includes explicit tab lists in `lists.spotlight`, `lists.local`, `lists.national`, and `lists.international`; the WordPress frontend renders those lists directly.

## Adding A News Link

The WordPress plugin includes a **FloridaRAMA News** admin screen. Paste a URL and a fine-grained GitHub token, and the screen triggers `.github/workflows/add-news-url.yml`.

The workflow runs `news/scripts/add-news-url.mjs`, fetches metadata, auto-detects the tab using `news/data/source-rules.json`, updates the JSON, and commits the change.

## Spotlight Curation

The plugin admin screen can also manage the public Spotlight tab without a GitHub token. It stores only the selected Spotlight item IDs and display order in WordPress. The article content, thumbnails, and Local/National/International tabs still come from the GitHub JSON feed.

If no WordPress Spotlight override has been saved, the frontend uses `lists.spotlight` from `news/data/news-items.json`.

## Automation

The GitHub Actions workflow at `.github/workflows/update-news-data.yml` runs weekly and can be started manually. It commits `news/data/news-items.json` only when the file changes.

The plugin default JSON URL points at:

```text
https://raw.githubusercontent.com/Novakukla/floridarama-news-sync/main/news/data/news-items.json
```

## WordPress

Install the plugin folder:

```text
wordpress/floridarama-news
```

Use the shortcode:

```text
[floridarama_news]
```

If the WordPress page already has a large page title/intro above the shortcode, use:

```text
[floridarama_news show_header="false"]
```

Override the JSON URL only if needed:

```text
[floridarama_news data_url="https://raw.githubusercontent.com/Novakukla/floridarama-news-sync/main/news/data/news-items.json"]
```

See `wordpress/floridarama-news/README.md` for shortcode options.
