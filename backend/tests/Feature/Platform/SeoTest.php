<?php

namespace Tests\Feature\Platform;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** robots.txt and sitemap.xml come from MySQL (the storefront is a single-page app, so it can't list its own pages). */
class SeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_robots_points_at_the_sitemap_and_keeps_private_pages_out(): void
    {
        config(['dmd.frontend_url' => 'https://shop.example.com']);
        $r = $this->get('/robots.txt')->assertOk();
        $this->assertStringStartsWith('text/plain', $r->headers->get('Content-Type'));
        $this->assertSame([], $r->headers->getCookies(), 'a public file sets no session cookie');
        $this->assertStringContainsString('Sitemap: https://shop.example.com/sitemap.xml', $r->getContent());
        foreach (['/admin', '/api/', '/account', '/checkout'] as $private) {
            $this->assertStringContainsString("Disallow: {$private}", $r->getContent());
        }
    }

    public function test_the_sitemap_lists_what_the_storefront_shows_and_nothing_else(): void
    {
        config(['dmd.frontend_url' => 'https://shop.example.com']);
        $games = Category::factory()->create(['slug' => 'games']);
        $hidden = Category::factory()->create(['slug' => 'secret', 'is_visible' => false]);
        $live = Product::factory()->create();
        $draft = Product::factory()->draft()->create();
        $archived = Product::factory()->create();
        $archived->delete();

        $xml = $this->get('/sitemap.xml')->assertOk()->assertHeader('Content-Type', 'application/xml; charset=utf-8')->getContent();
        $this->assertNotFalse(simplexml_load_string($xml), 'valid XML');
        $this->assertStringContainsString('<loc>https://shop.example.com/</loc>', $xml);
        $this->assertStringContainsString('https://shop.example.com/product-category/games', $xml);
        $this->assertStringContainsString("https://shop.example.com/product/{$live->id}<", $xml);
        $this->assertStringNotContainsString('/product-category/secret', $xml);
        $this->assertStringNotContainsString("/product/{$draft->id}<", $xml);
        $this->assertStringNotContainsString("/product/{$archived->id}<", $xml);
        unset($games, $hidden);
    }
}
