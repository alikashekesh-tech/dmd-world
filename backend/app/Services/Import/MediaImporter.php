<?php

namespace App\Services\Import;

use App\Services\Catalog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Copies images still served by the old store (product images, category and brand images, banner images and the
 * pictures kept on past order lines) into Laravel's public storage, and points every row at the copy, so the old
 * WordPress site can be switched off.
 *
 * Only addresses on the allowed hosts are fetched (the old store's), only real JPEG, PNG, WebP or GIF content up to
 * 10 MB is kept (checked from the bytes, not the address or the header), and files are named by their content hash,
 * so a picture used many times is stored once and running it again changes nothing.
 */
final class MediaImporter
{
    /** table => column */
    public const COLUMNS = ['product_images' => 'url', 'categories' => 'image_url', 'brands' => 'logo_url', 'banners' => 'image_url', 'order_items' => 'image_url'];

    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    private const MAX_BYTES = 10 * 1024 * 1024;

    private array $stats = ['addresses' => 0, 'copied' => 0, 'rows updated' => 0, 'failed' => 0];

    /** @var list<string> */
    public array $warnings = [];

    /** @param list<string> $hosts e.g. ['dmdworld.store'] */
    public function __construct(private array $hosts) {}

    /** @return list<string> every distinct address on an allowed host still stored in the database */
    public function pending(): array
    {
        $urls = [];
        foreach (self::COLUMNS as $table => $column) {
            foreach (DB::table($table)->where($column, 'like', 'http%')->distinct()->pluck($column) as $url) {
                if (in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), $this->hosts, true)) {
                    $urls[$url] = true;
                }
            }
        }

        return array_keys($urls);
    }

    public function import(bool $dryRun = false): array
    {
        $urls = $this->pending();
        $this->stats['addresses'] = count($urls);
        if ($dryRun) {
            return $this->stats;
        }
        foreach ($urls as $url) {
            try {
                $local = $this->copy($url);
            } catch (Throwable $e) {
                $this->stats['failed']++;
                $this->warnings[] = "{$url}: {$e->getMessage()}";

                continue;
            }
            foreach (self::COLUMNS as $table => $column) {
                $this->stats['rows updated'] += DB::table($table)->where($column, $url)->update([$column => $local]);
            }
            $this->stats['copied']++;
        }
        Catalog::bust();

        return $this->stats;
    }

    /** Downloads one image and returns its /storage path. */
    private function copy(string $url): string
    {
        $response = Http::timeout(30)->retry(2, 500, throw: false)->withOptions(['allow_redirects' => false])->get($url);
        if (! $response->successful()) {
            throw new \RuntimeException("the old store answered {$response->status()}");
        }
        $bytes = $response->body();
        if ($bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw new \RuntimeException('empty or larger than 10 MB');
        }
        $type = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $extension = self::TYPES[$type] ?? null;
        if (! $extension) {
            throw new \RuntimeException("not an image ({$type})");
        }
        $path = 'imported/'.substr(hash('sha256', $bytes), 0, 40).'.'.$extension;
        if (! Storage::disk('public')->exists($path)) {
            Storage::disk('public')->put($path, $bytes);
        }

        return '/storage/'.$path;
    }
}
