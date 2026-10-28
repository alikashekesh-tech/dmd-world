<?php

namespace Tests\Feature\Promotions;

use App\Models\Banner;
use App\Models\Category;
use App\Models\HomepageSection;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

    public function test_the_owner_creates_edits_switches_reorders_and_removes_banners(): void
    {
        $owner = $this->owner();
        $a = $owner->post('/api/v1/admin/banners', [
            'placement' => 'home', 'title' => 'Summer sale', 'text' => 'Up to 40% off headsets', 'link_url' => '/shop?on_sale=1', 'link_label' => 'Shop now',
            'image_url' => '/storage/uploads/2026/10/wide.jpg', 'image_mobile_url' => 'https://cdn.example/tall.webp', 'focal_point' => '30% 60%', 'overlay' => 'strong',
        ])->assertCreated()->assertJsonPath('data.status', 'live')->assertJsonPath('data.focal_point', '30% 60%')->json('data.id');
        $b = $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'New arrivals'])->assertCreated()
            ->assertJsonPath('data.overlay', 'soft')->assertJsonPath('data.image_mobile_url', null)->json('data.id');

        // The admin lists every banner, whatever its state, with what it needs to show it.
        $list = $owner->get('/api/v1/admin/homepage')->assertOk()->json('data.banners');
        $this->assertSame([$a, $b], array_column($list, 'id'));
        $this->assertSame('https://cdn.example/tall.webp', $list[0]['image_mobile_url']);

        // The storefront gets the display options too.
        $home = $this->home()['banners'];
        $this->assertSame(['Summer sale', 'New arrivals'], array_column($home, 'title'));
        $this->assertSame(['strong', '30% 60%', 'https://cdn.example/tall.webp'], [$home[0]['overlay'], $home[0]['focal_point'], $home[0]['image_mobile_url']]);

        // Switching off hides it from the storefront at once (the cached catalog is replaced), but not from the admin.
        $owner->patch("/api/v1/admin/banners/{$a}/active", ['is_active' => false])->assertOk()->assertJsonPath('data.status', 'off');
        $this->assertSame(['New arrivals'], array_column($this->home()['banners'], 'title'));
        $this->assertCount(2, $owner->get('/api/v1/admin/homepage')->json('data.banners'));
        $owner->patch("/api/v1/admin/banners/{$a}/active", [])->assertStatus(422);
        $owner->patch("/api/v1/admin/banners/{$a}/active", ['is_active' => true])->assertOk()->assertJsonPath('data.showing', true);

        // Editing keeps the rest; the scheduling states are reported.
        $owner->put("/api/v1/admin/banners/{$b}", ['placement' => 'home', 'title' => 'New arrivals', 'starts_at' => now()->addDay()->toIso8601String()])
            ->assertOk()->assertJsonPath('data.status', 'scheduled');
        $owner->put("/api/v1/admin/banners/{$b}", ['placement' => 'home', 'title' => 'New arrivals', 'starts_at' => now()->subWeek()->toIso8601String(), 'ends_at' => now()->subDay()->toIso8601String()])
            ->assertOk()->assertJsonPath('data.status', 'ended');
        $owner->put("/api/v1/admin/banners/{$b}", ['placement' => 'home', 'title' => 'New arrivals', 'starts_at' => null, 'ends_at' => null])->assertOk()->assertJsonPath('data.status', 'live');

        // Reordering.
        $owner->post('/api/v1/admin/banners/reorder', ['ids' => [$b, $a]])->assertOk();
        $this->assertSame(['New arrivals', 'Summer sale'], array_column($this->home()['banners'], 'title'));

        // Bad display options are refused.
        foreach ([['focal_point' => '120% 50%'], ['focal_point' => 'center'], ['overlay' => 'black'], ['image_mobile_url' => 'http://x.example/a.png'], ['image_mobile_url' => 'javascript:alert(1)']] as $bad) {
            $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Bad options'] + $bad)->assertStatus(422);
        }

        $owner->delete("/api/v1/admin/banners/{$a}")->assertNoContent();
        $this->assertSame(['New arrivals'], array_column($this->home()['banners'], 'title'));
        $this->assertSame([$b], array_column($owner->get('/api/v1/admin/homepage')->json('data.banners'), 'id'));
        $this->buyer()->patch("/api/v1/admin/banners/{$b}/active", ['is_active' => false])->assertUnauthorized();
    }

    public function test_banner_times_are_stored_in_utc_and_switch_at_the_right_moment(): void
    {
        $this->travelTo(Carbon::parse('2026-10-16 12:00:00', 'UTC'));
        $owner = $this->owner();

        // Picked in Beirut (UTC+3): 18:00 local is 15:00 UTC; it ends 20 October at 09:30 local, 06:30 UTC.
        $id = $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Evening drop', 'starts_at' => '2026-10-16T18:00:00+03:00', 'ends_at' => '2026-10-20T09:30:00+03:00'])
            ->assertCreated()->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.starts_at', '2026-10-16T15:00:00+00:00')->assertJsonPath('data.ends_at', '2026-10-20T06:30:00+00:00')->json('data.id');
        $row = DB::table('banners')->find($id);
        $this->assertSame(['2026-10-16 15:00:00', '2026-10-20 06:30:00'], [$row->starts_at, $row->ends_at], 'stored as UTC wall time');

        // The same instant sent in another zone (or as Z) is the same time.
        $owner->put("/api/v1/admin/banners/{$id}", ['placement' => 'home', 'title' => 'Evening drop', 'starts_at' => '2026-10-16T08:00:00-07:00', 'ends_at' => '2026-10-20T06:30:00.000Z'])
            ->assertOk()->assertJsonPath('data.starts_at', '2026-10-16T15:00:00+00:00')->assertJsonPath('data.ends_at', '2026-10-20T06:30:00+00:00');

        $titles = fn () => array_column($this->home()['banners'], 'title');
        $this->travelTo(Carbon::parse('2026-10-16 14:59:59', 'UTC'));
        $this->assertSame([], $titles(), 'a second before it starts');
        $this->travelTo(Carbon::parse('2026-10-16 15:00:00', 'UTC'));
        $this->assertSame(['Evening drop'], $titles(), 'from the start');
        $this->assertSame('live', $this->owner()->get('/api/v1/admin/homepage')->json('data.banners.0.status'));
        $this->travelTo(Carbon::parse('2026-10-20 06:29:59', 'UTC'));
        $this->assertSame(['Evening drop'], $titles(), 'a second before it ends');
        $this->travelTo(Carbon::parse('2026-10-20 06:30:00', 'UTC'));
        $this->assertSame([], $titles(), 'gone at the end');
        $this->assertSame('ended', $this->owner()->get('/api/v1/admin/homepage')->json('data.banners.0.status'));

        // The end must come after the start, compared as instants: 10:00+03:00 (07:00 UTC) is before 08:00Z.
        $owner = $this->owner(); // signed in again: the clock moved past the earlier session
        $owner->post('/api/v1/admin/banners', ['placement' => 'home', 'title' => 'Backwards', 'starts_at' => '2026-10-21T08:00:00Z', 'ends_at' => '2026-10-21T10:00:00+03:00'])
            ->assertStatus(422);
    }
}
