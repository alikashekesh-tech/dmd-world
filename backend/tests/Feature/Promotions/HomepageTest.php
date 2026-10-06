<?php

namespace Tests\Feature\Promotions;

use App\Models\Banner;
use App\Models\Category;
use App\Models\HomepageSection;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** What the storefront home shows, as the owner arranges it, sent inside the catalog. */
class HomepageTest extends TestCase
{
    use RefreshDatabase;

    private function home(): array
    {
        return $this->client()->get('/api/v1/catalog')->assertOk()->json('homepage');
    }

    public function test_the_owner_orders_and_hides_sections(): void
    {
        $keys = array_keys(HomepageSection::KEYS);
        $this->assertSame($keys, array_column($this->home()['sections'], 'key'));
        $owner = $this->owner();

        $new = array_map(fn ($k) => ['key' => $k, 'visible' => $k !== 'budget'], array_reverse($keys));
        $owner->put('/api/v1/admin/homepage/sections', ['sections' => $new])->assertOk();
        $home = $this->home();
        $this->assertSame(array_reverse($keys), array_column($home['sections'], 'key'));
        $this->assertFalse(collect($home['sections'])->firstWhere('key', 'budget')['visible']);

        $owner->put('/api/v1/admin/homepage/sections', ['sections' => array_slice($new, 1)])->assertStatus(422)->assertJsonPath('error.code', 'SECTIONS_INCOMPLETE');
        $owner->put('/api/v1/admin/homepage/sections', ['sections' => [...$new, ['key' => 'cms_page', 'visible' => true]]])->assertStatus(422);
        $this->buyer()->put('/api/v1/admin/homepage/sections', ['sections' => $new])->assertUnauthorized();
    }

    public function test_the_owner_hand_picks_products_and_categories(): void
    {
        $owner = $this->owner();
        [$a, $b] = Product::factory()->count(2)->create();
        $cats = Category::factory()->count(2)->create();

        $owner->put('/api/v1/admin/homepage/sections/price_drops/items', ['ids' => [$b->id, $a->id]])->assertOk();
        $owner->put('/api/v1/admin/homepage/sections/world/items', ['ids' => $cats->pluck('id')->all()])->assertOk()
            ->assertJsonPath('data.sections.6.items.0.name', $cats[0]->name);
        $this->assertSame(['price_drops' => [$b->id, $a->id], 'world' => $cats->pluck('id')->all()], $this->home()['picks']);

        $owner->put('/api/v1/admin/homepage/sections/price_drops/items', ['ids' => [Product::factory()->draft()->create()->id]])->assertStatus(422);
        $owner->put('/api/v1/admin/homepage/sections/price_drops/items', ['ids' => Product::factory()->count(13)->create()->pluck('id')->all()])->assertStatus(422);
        $owner->put('/api/v1/admin/homepage/sections/budget/items', ['ids' => [$a->id]])->assertStatus(422)->assertJsonPath('error.code', 'NO_PICKS');
        $owner->put('/api/v1/admin/homepage/sections/nope/items', ['ids' => []])->assertNotFound();

        $owner->put('/api/v1/admin/homepage/sections/price_drops/items', ['ids' => []])->assertOk();
        $this->assertSame([], $this->home()['picks']['price_drops'], 'empty: chosen automatically again');
    }

    public function test_banners_show_inside_their_dates_with_safe_links(): void
    {
        $owner = $this->owner();
        $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Ramadan deals', 'text' => 'Up to 30% off', 'link_url' => '/shop?on_sale=1', 'link_label' => 'Shop the sale'])
            ->assertCreated()->assertJsonPath('data.showing', true);
        $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Next week', 'starts_at' => now()->addWeek()->toIso8601String()])->assertCreated()->assertJsonPath('data.showing', false);
        $id = $owner->post('/api/v1/admin/banners', ['placement' => 'announcement', 'title' => 'Free pickup from Hamra'])->assertCreated()->json('data.id');

        $home = $this->home();
        $this->assertSame(['Ramadan deals'], array_column($home['banners'], 'title'));
        $this->assertSame('/shop?on_sale=1', $home['banners'][0]['link_url']);
        $this->assertSame('Free pickup from Hamra', $home['announcement']['title']);

        foreach (['javascript:alert(1)', '//evil.example/x', 'http://insecure.example', 'data:text/html,hi'] as $bad) {
            $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Bad link', 'link_url' => $bad, 'link_label' => 'Go'])->assertStatus(422);
        }
        $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Bad image', 'image_url' => 'http://x.example/a.png'])->assertStatus(422);
        $owner->post('/api/v1/admin/banners', ['placement' => 'sidebar', 'title' => 'Nowhere'])->assertStatus(422);
        $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'No label', 'link_url' => '/shop'])->assertStatus(422);

        $owner->put("/api/v1/admin/banners/{$id}", ['placement' => 'announcement', 'title' => 'Closed on Sunday', 'is_active' => false])->assertOk();
        $this->assertNull($this->home()['announcement']);
        $owner->delete("/api/v1/admin/banners/{$id}")->assertNoContent();
        $this->assertSame(2, Banner::count());
        $this->client()->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Guest banner'])->assertUnauthorized();
    }
}
