<?php

namespace App\Support;

/**
 * A product's video address: a clip uploaded in the admin (/storage/uploads/….mp4 or .webm) or a YouTube link
 * (watch, youtu.be, shorts or embed). Anything else is refused, so the storefront only ever plays its own files or
 * embeds YouTube's privacy-enhanced player.
 */
final class ProductVideo
{
    private const FILE = '#^/storage/uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.(mp4|webm)$#';

    private const YOUTUBE = '#^https://(?:(?:www\.|m\.)?youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})(?:[?&\#/].*)?$#';

    /** @return array{type: 'file', url: string}|array{type: 'youtube', id: string, url: string}|null */
    public static function parse(?string $url): ?array
    {
        $url = trim((string) $url);
        if (preg_match(self::FILE, $url)) {
            return ['type' => 'file', 'url' => $url];
        }
        if (preg_match(self::YOUTUBE, $url, $m)) {
            return ['type' => 'youtube', 'id' => $m[1], 'url' => "https://www.youtube.com/watch?v={$m[1]}"];
        }

        return null;
    }
}
