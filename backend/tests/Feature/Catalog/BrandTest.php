<?php

namespace Tests\Feature\Catalog;

use App\Models\Brand;
use App\Models\Category;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BrandTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '/api/v1/admin/brands';

    public function test_a_brand_the_owner_adds_appears_on_the_storefront(): void
    {
        $owner = $this->owner();
        $id = $owner->post(self::ADMIN, ['name' => 'Razer', 'logo_url' => 'https://example.com/razer.png', 'description' => 'For gamers, by gamers.'])
            ->assertCreated()->assertJsonPath('data.slug', 'razer')->assertJsonPath('data.is_active', true)->json('data.id');

        $this->client()->get('/api/v1/brands')->assertOk()->assertJsonFragment(['id' => $id, 'name' => 'Razer', 'logo_url' => 'https://example.com/razer.png']);
        $this->client()->get('/api/v1/brands/razer')->assertOk()->assertJsonPath('data.product_lines', []);

        $owner->put(self::ADMIN."/{$id}", ['name' => 'Razer Inc.'])->assertOk()->assertJsonPath('data.slug', 'razer');
        $this->client()->get('/api/v1/brands/razer')->assertJsonPath('data.name', 'Razer Inc.');
    }

    public function test_validation_and_unique_slugs(): void
    {
        $owner = $this->owner();
        $owner->post(self::ADMIN, [])->assertStatus(422)->assertJsonPath('error.fields.name.0', 'Give the brand a name.');
        $owner->post(self::ADMIN, ['name' => 'X', 'logo_url' => 'ftp://example.com/x.png'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['logo_url']]]);
        $owner->post(self::ADMIN, ['name' => 'Logitech'])->assertCreated();
        $owner->post(self::ADMIN, ['name' => 'Logitech G', 'slug' => 'logitech'])->assertStatus(422)->assertJsonPath('error.code', 'SLUG_TAKEN');
        $owner->post(self::ADMIN, ['name' => 'Logitech'])->assertCreated()->assertJsonPath('data.slug', 'logitech-2');
    }

    public function test_inactive_brands_leave_the_storefront_but_stay_in_the_admin(): void
    {
        $owner = $this->owner();
        $brand = Brand::factory()->create(['slug' => 'fantech']);
        $owner->put(self::ADMIN."/{$brand->id}", ['is_active' => false])->assertOk();

        $this->assertNotContains($brand->id, array_column($this->client()->get('/api/v1/brands')->json('data'), 'id'));
        $this->client()->get('/api/v1/brands/fantech')->assertNotFound();
        $owner->get(self::ADMIN)->assertJsonFragment(['id' => $brand->id, 'is_active' => false]);
    }

    public function test_archive_restore_and_permanent_delete(): void
    {
        $owner = $this->owner();
        $used = Brand::factory()->create();
        Category::factory()->create(['brand_id' => $used->id]);
        $unused = Brand::factory()->create();

        $owner->delete(self::ADMIN."/{$used->id}")->assertNoContent();
        $owner->delete(self::ADMIN."/{$used->id}/permanent")->assertStatus(409)->assertJsonPath('error.code', 'BRAND_IN_USE');
        $owner->get(self::ADMIN.'?archived=only')->assertJsonFragment(['id' => $used->id]);
        $owner->post(self::ADMIN."/{$used->id}/restore")->assertOk();

        $owner->delete(self::ADMIN."/{$unused->id}/permanent")->assertStatus(409)->assertJsonPath('error.code', 'NOT_ARCHIVED');
        $owner->delete(self::ADMIN."/{$unused->id}")->assertNoContent();
        $owner->delete(self::ADMIN."/{$unused->id}/permanent")->assertNoContent();
        $this->assertNull(Brand::withTrashed()->find($unused->id));
    }

    public function test_brands_can_be_reordered(): void
    {
        $owner = $this->owner();
        [$a, $b] = Brand::factory()->count(2)->create()->pluck('id')->all();
        $owner->post(self::ADMIN.'/reorder', ['ids' => [$b, $a]])->assertNoContent();

        $this->assertSame([$b, $a], array_column($this->client()->get('/api/v1/brands')->json('data'), 'id'));
    }

    public function test_only_the_owner_can_change_brands(): void
    {
        $brand = Brand::factory()->create();
        foreach ([$this->client(), $this->buyer()] as $browser) {
            $browser->post(self::ADMIN, ['name' => 'Hacked'])->assertUnauthorized();
            $browser->put(self::ADMIN."/{$brand->id}", ['name' => 'Hacked'])->assertUnauthorized();
            $browser->delete(self::ADMIN."/{$brand->id}")->assertUnauthorized();
        }
        $this->assertSame($brand->name, $brand->fresh()->name);
    }
}
