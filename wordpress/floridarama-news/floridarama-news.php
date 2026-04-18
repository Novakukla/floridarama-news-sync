<?php
/**
 * Plugin Name: FloridaRAMA News
 * Description: Renders FloridaRAMA news data from a JSON feed with the [floridarama_news] shortcode.
 * Version: 1.0.0
 * Author: FloridaRAMA
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('FR_NEWS_VERSION', '1.0.0');
define('FR_NEWS_DEFAULT_DATA_URL', 'https://raw.githubusercontent.com/Novakukla/floridarama-news-sync/main/news/data/news-items.json');
define('FR_NEWS_GITHUB_REPO', 'Novakukla/floridarama-news-sync');
define('FR_NEWS_GITHUB_REF', 'main');
define('FR_NEWS_ADD_WORKFLOW', 'add-news-url.yml');

function fr_news_register_assets() {
    $base_url = plugin_dir_url(__FILE__);
    $base_path = plugin_dir_path(__FILE__);

    wp_register_style(
        'floridarama-news',
        $base_url . 'assets/news.css',
        array(),
        filemtime($base_path . 'assets/news.css')
    );

    wp_register_script(
        'floridarama-news',
        $base_url . 'assets/news.js',
        array(),
        filemtime($base_path . 'assets/news.js'),
        true
    );
}
add_action('wp_enqueue_scripts', 'fr_news_register_assets');

function fr_news_shortcode($atts) {
    $atts = shortcode_atts(
        array(
            'data_url' => apply_filters('fr_news_default_data_url', FR_NEWS_DEFAULT_DATA_URL),
            'default_filter' => 'spotlight',
            'layout' => 'wide',
            'show_header' => 'true',
            'show_tip' => 'true',
        ),
        $atts,
        'floridarama_news'
    );

    $default_filter = 'nation' === $atts['default_filter'] ? 'national' : $atts['default_filter'];
    $allowed_filters = array('spotlight', 'local', 'national', 'international');
    $default_filter = in_array($default_filter, $allowed_filters, true) ? $default_filter : 'spotlight';
    $layout = 'normal' === $atts['layout'] ? 'normal' : 'wide';
    $show_header = filter_var($atts['show_header'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
    $show_tip = filter_var($atts['show_tip'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';

    wp_enqueue_style('floridarama-news');
    wp_enqueue_script('floridarama-news');

    ob_start();
    ?>
    <div
        class="fr-news fr-news--<?php echo esc_attr($layout); ?>"
        data-news-url="<?php echo esc_url($atts['data_url']); ?>"
        data-default-filter="<?php echo esc_attr($default_filter); ?>"
        data-show-header="<?php echo esc_attr($show_header); ?>"
        data-show-tip="<?php echo esc_attr($show_tip); ?>"
    >
        <?php if ('true' === $show_header) : ?>
        <div class="fr-news__header">
            <div>
                <h2 class="fr-news__title">News &amp; Media</h2>
                <p class="fr-news__subtitle">Press, features, and video coverage of FloridaRAMA.</p>
            </div>
        </div>
        <?php endif; ?>
        <p class="fr-news__fallback">
            FloridaRAMA news is loading. Visit
            <a href="<?php echo esc_url($atts['data_url']); ?>" target="_blank" rel="noopener noreferrer">the news feed</a>
            if this section does not appear.
        </p>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode('floridarama_news', 'fr_news_shortcode');

function fr_news_admin_menu() {
    add_menu_page(
        'FloridaRAMA News',
        'FloridaRAMA News',
        'manage_options',
        'floridarama-news',
        'fr_news_render_admin_page',
        'dashicons-media-document',
        58
    );
}
add_action('admin_menu', 'fr_news_admin_menu');

function fr_news_admin_notice($message, $type = 'info') {
    $allowed = array('success', 'error', 'warning', 'info');
    $type = in_array($type, $allowed, true) ? $type : 'info';
    printf(
        '<div class="notice notice-%1$s"><p>%2$s</p></div>',
        esc_attr($type),
        wp_kses_post($message)
    );
}

function fr_news_dispatch_add_url($token, $url, $group, $type, $spotlight) {
    $endpoint = sprintf(
        'https://api.github.com/repos/%s/actions/workflows/%s/dispatches',
        rawurlencode(FR_NEWS_GITHUB_REPO),
        rawurlencode(FR_NEWS_ADD_WORKFLOW)
    );

    // GitHub expects the owner/repo slash to remain literal in this endpoint.
    $endpoint = str_replace('%2F', '/', $endpoint);

    $response = wp_remote_post(
        $endpoint,
        array(
            'timeout' => 20,
            'headers' => array(
                'Authorization' => 'Bearer ' . $token,
                'Accept' => 'application/vnd.github+json',
                'Content-Type' => 'application/json',
                'User-Agent' => 'FloridaRAMA-News-WordPress',
                'X-GitHub-Api-Version' => '2022-11-28',
            ),
            'body' => wp_json_encode(
                array(
                    'ref' => FR_NEWS_GITHUB_REF,
                    'inputs' => array(
                        'url' => $url,
                        'group' => $group,
                        'type' => $type,
                        'spotlight' => $spotlight ? 'true' : 'false',
                    ),
                )
            ),
        )
    );

    if (is_wp_error($response)) {
        return $response;
    }

    $code = wp_remote_retrieve_response_code($response);
    if (204 === $code) {
        return true;
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    $message = isset($body['message']) ? $body['message'] : 'GitHub returned HTTP ' . $code . '.';

    return new WP_Error('fr_news_github_error', $message, array('status' => $code));
}

function fr_news_render_admin_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $notice = null;
    $notice_type = 'info';

    if ('POST' === $_SERVER['REQUEST_METHOD'] && isset($_POST['fr_news_add_url_nonce'])) {
        check_admin_referer('fr_news_add_url', 'fr_news_add_url_nonce');

        $token = isset($_POST['fr_news_token']) ? trim(sanitize_text_field(wp_unslash($_POST['fr_news_token']))) : '';
        $url = isset($_POST['fr_news_url']) ? esc_url_raw(wp_unslash($_POST['fr_news_url'])) : '';
        $group = isset($_POST['fr_news_group']) ? sanitize_key(wp_unslash($_POST['fr_news_group'])) : 'auto';
        $type = isset($_POST['fr_news_type']) ? sanitize_key(wp_unslash($_POST['fr_news_type'])) : 'auto';
        $spotlight = !empty($_POST['fr_news_spotlight']);

        $allowed_groups = array('auto', 'local', 'national', 'international');
        $allowed_types = array('auto', 'article', 'video');
        $group = in_array($group, $allowed_groups, true) ? $group : 'auto';
        $type = in_array($type, $allowed_types, true) ? $type : 'auto';

        if (!$token || !$url) {
            $notice = 'Paste a GitHub token and a news URL before submitting.';
            $notice_type = 'error';
        } else {
            $result = fr_news_dispatch_add_url($token, $url, $group, $type, $spotlight);
            if (true === $result) {
                $notice = sprintf(
                    'Submitted to GitHub Actions. Check the <a href="%s" target="_blank" rel="noopener noreferrer">Add FloridaRAMA news URL workflow</a> for progress.',
                    esc_url('https://github.com/' . FR_NEWS_GITHUB_REPO . '/actions/workflows/' . FR_NEWS_ADD_WORKFLOW)
                );
                $notice_type = 'success';
            } else {
                $status = is_wp_error($result) && $result->get_error_data('status') ? ' HTTP ' . intval($result->get_error_data('status')) . '.' : '';
                $notice = 'GitHub workflow dispatch failed.' . $status . ' ' . esc_html($result->get_error_message());
                $notice_type = 'error';
            }
        }
    }

    ?>
    <div class="wrap fr-news-admin">
        <h1>FloridaRAMA News</h1>
        <?php if ($notice) : ?>
            <?php fr_news_admin_notice($notice, $notice_type); ?>
        <?php endif; ?>

        <div class="card" style="max-width: 760px;">
            <h2>Add a News URL</h2>
            <p>
                Paste a news article or video URL. WordPress will trigger GitHub Actions, and the workflow will fetch metadata,
                classify the story, update the JSON feed, and commit it.
            </p>
            <form method="post" action="">
                <?php wp_nonce_field('fr_news_add_url', 'fr_news_add_url_nonce'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="fr_news_url">News URL</label></th>
                        <td>
                            <input name="fr_news_url" id="fr_news_url" type="url" class="regular-text" required placeholder="https://example.com/story">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="fr_news_group">Tab</label></th>
                        <td>
                            <select name="fr_news_group" id="fr_news_group">
                                <option value="auto">Auto-detect</option>
                                <option value="local">Local</option>
                                <option value="national">National</option>
                                <option value="international">International</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="fr_news_type">Type</label></th>
                        <td>
                            <select name="fr_news_type" id="fr_news_type">
                                <option value="auto">Auto-detect</option>
                                <option value="article">Article</option>
                                <option value="video">Video</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Spotlight</th>
                        <td>
                            <label>
                                <input name="fr_news_spotlight" type="checkbox" value="1">
                                Also add this item to Spotlight
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="fr_news_token">GitHub Token</label></th>
                        <td>
                            <input name="fr_news_token" id="fr_news_token" type="password" class="regular-text" required autocomplete="off">
                            <p class="description">
                                Not saved. Use a fine-grained token scoped to <code><?php echo esc_html(FR_NEWS_GITHUB_REPO); ?></code>
                                with permission to run Actions/workflows.
                            </p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('Submit to GitHub Actions'); ?>
            </form>
        </div>

        <div class="card" style="max-width: 760px;">
            <h2>Workflow</h2>
            <ol>
                <li>Create or paste a fine-grained GitHub token.</li>
                <li>Submit a URL here.</li>
                <li>GitHub Actions updates <code>news/data/news-items.json</code>.</li>
                <li>The public page updates after the raw GitHub JSON is refreshed.</li>
            </ol>
            <p>
                <a href="<?php echo esc_url('https://github.com/' . FR_NEWS_GITHUB_REPO . '/actions/workflows/' . FR_NEWS_ADD_WORKFLOW); ?>" target="_blank" rel="noopener noreferrer">
                    Open the GitHub workflow
                </a>
            </p>
        </div>
    </div>
    <?php
}
