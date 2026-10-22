<?php

namespace Tests\Feature\Import;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** dmd:import-media: images still served by the old WordPress site are copied into Laravel's storage. */
class MediaImportTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    public function test_old_store_images_are_copied_once_and_every_row_points_at_the_copy(): void
    {
        Storage::fake('public');
        config(['dmd.import.media_hosts' => ['dmdworld.store']]);
        $old = 'https://dmdworld.store/wp-content/uploads/2025/01/pad.png';
        $notImage = 'https://dmdworld.store/wp-content/uploads/2025/01/page.png';
        $elsewhere = 'https://cdn.example.com/pad.png';
        $p = Product::factory()->create();
        $p->images()->createMany([['url' => $old, 'position' => 0], ['url' => $notImage, 'position' => 1], ['url' => $elsewhere, 'position' => 2]]);
        DB::table('brands')->insert(['name' => 'Pads', 'slug' => 'pads', 'logo_url' => $old, 'created_at' => now(), 'updated_at' => now()]);

        Http::swap(new Factory(app('events')));
        Http::preventStrayRequests(); // nothing outside the allowed host is ever fetched
        Http::fake([
            'dmdworld.store/wp-content/uploads/2025/01/pad.png' => Http::response(base64_decode(self::PNG), 200, ['Content-Type' => 'image/png']),
            'dmdworld.store/wp-content/uploads/2025/01/page.png' => Http::response('<html>Not found</html>', 200, ['Content-Type' => 'image/png']),
        ]);

        $this->artisan('dmd:import-media --dry-run')->expectsOutputToContain('2 addresses')->assertSuccessful();
        $this->artisan('dmd:import-media')->expectsOutputToContain('not an image')->assertFailed();

        $copy = $p->images()->where('position', 0)->value('url');
        $this->assertMatchesRegularExpression('#^/storage/imported/[0-9a-f]{40}\.png$#', $copy);
        Storage::disk('public')->assertExists(substr($copy, strlen('/storage/')));
        $this->assertSame($copy, DB::table('brands')->where('slug', 'pads')->value('logo_url'), 'the same picture is stored once');
        $this->assertSame($notImage, $p->images()->where('position', 1)->value('url'), 'what isn’t an image stays as it was');
        $this->assertSame($elsewhere, $p->images()->where('position', 2)->value('url'), 'other hosts are never touched');

        Http::fake(['*' => Http::response(base64_decode(self::PNG))]);
        $this->artisan('dmd:import-media --dry-run')->expectsOutputToContain('1 addresses')->assertSuccessful(); // only the one that failed
    }

    public function test_it_refuses_to_run_without_an_old_store_host(): void
    {
        config(['dmd.import.media_hosts' => []]);
        $this->artisan('dmd:import-media')->expectsOutputToContain('IMPORT_WOO_URL')->assertFailed();
    }
}
