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
- `default_filter`: `spotlight`, `local`, `nation`, or `international`.
- `layout`: `wide` or `normal`. The default `wide` helps the grid fill a WordPress page that has a narrow content column.
- `show_header`: `true` or `false`.
- `show_tip`: `true` or `false`.

You can also override the default feed URL in theme/plugin PHP:

```php
add_filter('fr_news_default_data_url', function () {
    return 'https://your-site.example/news-items.json';
});
```

## Notes

- CSS is namespaced under `.fr-news`.
- The JavaScript initializes each shortcode instance independently.
- YouTube videos open in an accessible modal using `youtube-nocookie.com`.
- Non-YouTube video links open in a new tab.
- External article links use `target="_blank"` and `rel="noopener noreferrer"`.
