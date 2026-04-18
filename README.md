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

## Automation

The GitHub Actions workflow at `.github/workflows/update-news-data.yml` runs weekly and can be started manually. It commits `news/data/news-items.json` only when the file changes.

After pushing this repo to GitHub, update the plugin default URL if the owner/name differs from:

```text
https://raw.githubusercontent.com/floridarama/floridarama-news-sync/main/news/data/news-items.json
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

Override the JSON URL when needed:

```text
[floridarama_news data_url="https://raw.githubusercontent.com/YOUR-OWNER/floridarama-news-sync/main/news/data/news-items.json"]
```

See `wordpress/floridarama-news/README.md` for shortcode options.
