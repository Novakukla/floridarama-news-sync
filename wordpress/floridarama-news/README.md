# FloridaRAMA News WordPress Plugin

This folder is a copy-paste WordPress plugin. Upload `wordpress/floridarama-news` to `wp-content/plugins/floridarama-news`, activate it, then place this shortcode on a page:

```text
[floridarama_news]
```

## Shortcode Attributes

```text
[floridarama_news data_url="https://example.com/news-items.json" default_filter="local" layout="normal" show_header="false" show_tip="false"]
```

- `data_url`: JSON feed URL. By default this points at the expected raw GitHub URL for this repo.
- `default_filter`: `spotlight`, `local`, `national`, or `international`. The old `nation` value is still accepted as an alias.
- `layout`: `wide` or `normal`. The default `wide` helps the grid fill a WordPress page that has a narrow content column.
- `show_header`: `true` or `false`.
- `show_tip`: `true` or `false`.

You can also override the default feed URL in theme/plugin PHP:

```php
add_filter('fr_news_default_data_url', function () {
    return 'https://your-site.example/news-items.json';
});
```

## Adding News From WordPress

After activation, go to **FloridaRAMA News** in the WordPress admin.

Paste:

- the news article or video URL
- a tab choice, or `Auto-detect`
- an optional Spotlight checkbox
- a fine-grained GitHub token

The token is used for that request only and is not saved by the plugin. The admin form triggers the `add-news-url.yml` GitHub Actions workflow, and the workflow updates `news/data/news-items.json`.

Use a fine-grained GitHub token scoped only to `Novakukla/floridarama-news-sync` with permission to run Actions/workflows. If GitHub rejects the request with a permission error, add the narrowest workflow/Actions write permission GitHub allows for workflow dispatch.

## Notes

- CSS is namespaced under `.fr-news`.
- The JavaScript initializes each shortcode instance independently.
- YouTube videos open in an accessible modal using `youtube-nocookie.com`.
- Non-YouTube video links open in a new tab.
- External article links use `target="_blank"` and `rel="noopener noreferrer"`.
