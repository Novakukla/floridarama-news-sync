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

    $allowed_filters = array('spotlight', 'local', 'nation', 'international');
    $default_filter = in_array($atts['default_filter'], $allowed_filters, true) ? $atts['default_filter'] : 'spotlight';
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
