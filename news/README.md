# FloridaRAMA News Data

`news/data/news-items.json` is the portable data source for the WordPress news frontend. It contains:

- `updatedAt`: the last time the feed was written.
- `items`: card-based feature stories and videos.
- `localLinks`: grouped local source links for the Local News Features tab.

## Update Locally

Run a dry run first:

```sh
node news/scripts/update-news-data.mjs
```

Write changes:

```sh
node news/scripts/update-news-data.mjs --write
```

Optional flags:

- `--refresh-titles`: replace existing item titles with fetched titles.
- `--refresh-thumbs`: replace existing item thumbnails with fetched thumbnails.
- `--data=path/to/news-items.json`: update a non-default JSON file.

The updater fills missing data conservatively. Existing curated descriptions are preserved, existing thumbnails are preserved unless `--refresh-thumbs` is used, and existing titles are preserved unless blank or `--refresh-titles` is used.

## Manual Edits

To add a featured card, add an object to `items` with:

```json
{
  "id": "stable-human-readable-id",
  "type": "article",
  "group": "local",
  "tag": "Press",
  "title": "Story title",
  "source": "Source Name",
  "url": "https://example.com/story",
  "thumb": "https://example.com/image.jpg",
  "description": "Short card description.",
  "spotlight": true
}
```

Use `group` values of `local`, `nation`, or `international`. Add `spotlight: true` when the item should appear in the Spotlight tab.

For YouTube videos, `thumb` can be blank. The updater and frontend derive `https://img.youtube.com/vi/.../hqdefault.jpg`.

## GitHub Action

`.github/workflows/update-news-data.yml` runs weekly on Monday morning UTC and can also be started manually with `workflow_dispatch`. It runs the updater in write mode and commits only when `news/data/news-items.json` changes.
