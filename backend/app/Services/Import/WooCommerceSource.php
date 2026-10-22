<?php

namespace App\Services\Import;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Reads the old store through the WooCommerce REST API (wc/v3). It only ever sends GET requests, so a read-only key
 * is enough and the old store can't be changed by an import.
 */
final class WooCommerceSource
{
    public function __construct(private string $url, private string $key, private string $secret) {}

    public static function fromConfig(): self
    {
        $c = config('dmd.import.woocommerce');
        if (empty($c['url']) || empty($c['key']) || empty($c['secret'])) {
            throw new RuntimeException('Set IMPORT_WOO_URL, IMPORT_WOO_KEY and IMPORT_WOO_SECRET in backend/.env first.');
        }

        return new self($c['url'], $c['key'], $c['secret']);
    }

    /** Every record of a list endpoint (100 per page). */
    public function all(string $path, array $query = [], int $maxPages = 200): array
    {
        $out = [];
        for ($page = 1; $page <= $maxPages; $page++) {
            $response = Http::withBasicAuth($this->key, $this->secret)->acceptJson()->timeout(60)->retry(2, 500, throw: false)
                ->get(rtrim($this->url, '/').'/wp-json/wc/v3'.$path, [...$query, 'per_page' => 100, 'page' => $page]);
            if (! $response->successful()) {
                throw new RuntimeException("The store answered {$response->status()} for {$path} (page {$page}).");
            }
            $rows = $response->json();
            if (! is_array($rows)) {
                throw new RuntimeException("The store sent something unexpected for {$path}.");
            }
            array_push($out, ...$rows);
            $pages = (int) ($response->header('X-WP-TotalPages') ?: 1);
            if ($page >= $pages || count($rows) === 0) {
                break;
            }
        }

        return $out;
    }
}
