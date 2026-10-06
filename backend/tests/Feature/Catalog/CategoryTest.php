<?php

namespace Tests\Feature\Catalog;

use App\Models\Activity;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN = '/api/v1/admin/categories';

    public function test_a_category_the_owner_adds_is_what_the_storefront_lists(): void
    {
        $owner = $this->owner();
        $id = $owner->post(self::ADMIN, ['name' => 'Racing Wheels', 'description' => 'Wheels and pedals', 'accent_color' => '#1F6FEB'])
            ->assertCreated()
            ->assertJsonPath('data.slug', 'racing-wheels')
            ->assertJsonPath('data.accent_color', '#1f6feb')
            ->assertJsonPath('data.on_storefront', true)
            ->json('data.id');
        $this->assertGreaterThanOrEqual(100000, $id, 'new categories live above the imported id range');

        $owner->get(self::ADMIN)->assertOk()->assertJsonFragment(['id' => $id, 'name' => 'Racing Wheels']);
        $this->client()->get('/api/v1/categories')->assertOk()->assertJsonFragment(['id' => $id, 'path' => 'racing-wheels']);

        $owner->put(self::ADMIN."/{$id}", ['name' => 'Sim Racing'])->assertOk()->assertJsonPath('data.slug', 'racing-wheels');
        $this->client()->get("/api/v1/categories/{$id}")->assertOk()->assertJsonPath('data.name', 'Sim Racing');
        $this->assertTrue(Activity::where('action', 'category.updated')->whereNotNull('admin_id')->exists());
    }

    public function test_nested_categories_resolve_by_storefront_path(): void
    {
        $owner = $this->owner();
        $ps = $owner->post(self::ADMIN, ['name' => 'PlayStation'])->json('data.id');
        $ps5 = $owner->post(self::ADMIN, ['name' => 'PS5', 'parent_id' => $ps])->json('data.id');
        $games = $owner->post(self::ADMIN, ['name' => 'Games', 'parent_id' => $ps5])->json('data.id');

        $this->client()->get('/api/v1/categories/lookup?path=playstation/ps5/games')->assertOk()
            ->assertJsonPath('data.id', $games)
            ->assertJsonPath('data.path', 'playstation/ps5/games')
            ->assertJsonPath('data.ancestors.0.id', $ps)
            ->assertJsonPath('data.ancestors.1.id', $ps5);
        $this->client()->get("/api/v1/categories/{$ps}")->assertJsonPath('data.children.0.id', $ps5);
        $this->client()->get('/api/v1/categories/lookup?path=playstation/ps4')->assertNotFound();
    }

    public function test_validation_names_the_problem(): void
    {
        $owner = $this->owner();
        $owner->post(self::ADMIN, [])->assertStatus(422)->assertJsonPath('error.fields.name.0', 'Give the category a name.');
        $owner->post(self::ADMIN, ['name' => 'X', 'slug' => 'Not A Slug!'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['slug']]]);
        $owner->post(self::ADMIN, ['name' => 'X', 'image_url' => 'javascript:alert(1)'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['image_url']]]);
        $owner->post(self::ADMIN, ['name' => '<b>X</b>'])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['name']]]);
        $owner->post(self::ADMIN, ['name' => 'X', 'parent_id' => 999999])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['parent_id']]]);
    }

    public function test_slugs_are_unique_among_siblings_only(): void
    {
        $owner = $this->owner();
        $ps4 = $owner->post(self::ADMIN, ['name' => 'PS4'])->json('data.id');
        $ps5 = $owner->post(self::ADMIN, ['name' => 'PS5'])->json('data.id');
        $owner->post(self::ADMIN, ['name' => 'Games', 'parent_id' => $ps4])->assertCreated();
        $owner->post(self::ADMIN, ['name' => 'Games', 'parent_id' => $ps5])->assertCreated()->assertJsonPath('data.slug', 'games');

        $owner->post(self::ADMIN, ['name' => 'More games', 'slug' => 'games', 'parent_id' => $ps4])->assertStatus(422)->assertJsonPath('error.code', 'SLUG_TAKEN');
        $owner->post(self::ADMIN, ['name' => 'Games', 'parent_id' => $ps4])->assertCreated()->assertJsonPath('data.slug', 'games-2');
    }

    public function test_a_category_cannot_be_moved_inside_itself(): void
    {
        $owner = $this->owner();
        $a = $owner->post(self::ADMIN, ['name' => 'A'])->json('data.id');
        $b = $owner->post(self::ADMIN, ['name' => 'B', 'parent_id' => $a])->json('data.id');

        $owner->put(self::ADMIN."/{$a}", ['parent_id' => $b])->assertStatus(422)->assertJsonPath('error.code', 'CATEGORY_CYCLE');
        $owner->put(self::ADMIN."/{$a}", ['parent_id' => $a])->assertStatus(422)->assertJsonPath('error.code', 'CATEGORY_CYCLE');
    }

    public function test_brand_product_lines_and_inheritance(): void
    {
        $owner = $this->owner();
        $razer = Brand::factory()->create(['name' => 'Razer', 'slug' => 'razer']);
        $other = Brand::factory()->create();
        $mouse = $owner->post(self::ADMIN, ['name' => 'Mouse', 'brand_id' => $razer->id])->assertCreated()->json('data.id');
        $wireless = $owner->post(self::ADMIN, ['name' => 'Wireless', 'parent_id' => $mouse])->assertCreated()->assertJsonPath('data.brand_id', $razer->id)->json('data.id');
        $owner->post(self::ADMIN, ['name' => 'Wired', 'parent_id' => $mouse, 'brand_id' => $other->id])->assertStatus(422)->assertJsonPath('error.code', 'BRAND_MISMATCH');

        $this->client()->get('/api/v1/categories/lookup?path=razer/mouse/wireless')->assertOk()->assertJsonPath('data.id', $wireless);
        $this->client()->get('/api/v1/brands/razer')->assertOk()->assertJsonFragment(['id' => $mouse, 'path' => 'razer/mouse']);

        // Moving the line to another brand moves its whole branch.
        $owner->put(self::ADMIN."/{$mouse}", ['brand_id' => $other->id])->assertOk();
        $this->assertSame($other->id, Category::find($wireless)->brand_id);
    }

    public function test_top_level_categories_and_brands_never_share_a_web_address(): void
    {
        $owner = $this->owner();
        Brand::factory()->create(['slug' => 'razer']);
        $owner->post(self::ADMIN, ['name' => 'Razer', 'slug' => 'razer'])->assertStatus(422)->assertJsonPath('error.code', 'SLUG_TAKEN');
        $owner->post(self::ADMIN, ['name' => 'Razer'])->assertCreated()->assertJsonPath('data.slug', 'razer-2');
        $owner->post(self::ADMIN, ['name' => 'Gadgets'])->assertCreated();
        $owner->post('/api/v1/admin/brands', ['name' => 'Gadgets'])->assertStatus(201)->assertJsonPath('data.slug', 'gadgets-2');
        $owner->post('/api/v1/admin/brands', ['name' => 'X', 'slug' => 'gadgets'])->assertStatus(422)->assertJsonPath('error.code', 'SLUG_TAKEN');
    }

    public function test_hidden_categories_and_everything_below_them_leave_the_storefront(): void
    {
        $owner = $this->owner();
        $parent = $owner->post(self::ADMIN, ['name' => 'Retro', 'is_visible' => false])->json('data.id');
        $child = $owner->post(self::ADMIN, ['name' => 'Consoles', 'parent_id' => $parent])->assertJsonPath('data.on_storefront', false)->json('data.id');

        $public = $this->client()->get('/api/v1/categories')->assertOk();
        $this->assertNotContains($parent, array_column($public->json('data'), 'id'));
        $this->assertNotContains($child, array_column($public->json('data'), 'id'));
        $this->client()->get("/api/v1/categories/{$child}")->assertNotFound();
        $this->client()->get('/api/v1/categories/lookup?path=retro/consoles')->assertNotFound();

        $owner->get(self::ADMIN)->assertJsonFragment(['id' => $child, 'is_visible' => true, 'on_storefront' => false]);
        $owner->put(self::ADMIN."/{$parent}", ['is_visible' => true])->assertOk();
        $this->client()->get("/api/v1/categories/{$child}")->assertOk();
    }

    public function test_an_inactive_brand_hides_its_product_lines(): void
    {
        $brand = Brand::factory()->inactive()->create(['slug' => 'hyperx']);
        $line = Category::factory()->create(['brand_id' => $brand->id, 'slug' => 'keyboards']);

        $this->client()->get("/api/v1/categories/{$line->id}")->assertNotFound();
        $this->client()->get('/api/v1/brands/hyperx')->assertNotFound();
    }

    public function test_archive_restore_and_permanent_delete(): void
    {
        $owner = $this->owner();
        $parent = $owner->post(self::ADMIN, ['name' => 'Toys'])->json('data.id');
        $child = $owner->post(self::ADMIN, ['name' => 'Cars', 'parent_id' => $parent])->json('data.id');

        $owner->delete(self::ADMIN."/{$parent}")->assertStatus(409)->assertJsonPath('error.code', 'CATEGORY_HAS_CHILDREN');
        $owner->delete(self::ADMIN."/{$child}/permanent")->assertStatus(409)->assertJsonPath('error.code', 'NOT_ARCHIVED');
        $owner->delete(self::ADMIN."/{$child}")->assertNoContent();

        $this->assertNotContains($child, array_column($owner->get(self::ADMIN)->json('data'), 'id'));
        $owner->get(self::ADMIN.'?archived=only')->assertJsonFragment(['id' => $child]);
        $this->client()->get("/api/v1/categories/{$child}")->assertNotFound();
        $owner->put(self::ADMIN."/{$child}", ['name' => 'Edited'])->assertNotFound();

        $owner->post(self::ADMIN."/{$child}/restore")->assertOk()->assertJsonPath('data.archived_at', null);
        $this->client()->get("/api/v1/categories/{$child}")->assertOk();

        $owner->delete(self::ADMIN."/{$child}")->assertNoContent();
        $owner->delete(self::ADMIN."/{$child}/permanent")->assertNoContent();
        $this->assertNull(Category::withTrashed()->find($child));
    }

    public function test_siblings_can_be_reordered(): void
    {
        $owner = $this->owner();
        [$a, $b, $c] = array_map(fn ($n) => $owner->post(self::ADMIN, ['name' => $n])->json('data.id'), ['A', 'B', 'C']);
        $d = $owner->post(self::ADMIN, ['name' => 'D', 'parent_id' => $a])->json('data.id');

        $owner->post(self::ADMIN.'/reorder', ['ids' => [$c, $a, $b]])->assertNoContent();
        $this->assertSame([$c, $a, $b], array_values(array_filter(array_column($this->client()->get('/api/v1/categories')->json('data'), 'id'), fn ($id) => $id !== $d)));
        $owner->post(self::ADMIN.'/reorder', ['ids' => [$a, $d]])->assertStatus(422)->assertJsonPath('error.code', 'NOT_SIBLINGS');
    }

    public function test_only_the_owner_can_change_categories(): void
    {
        $category = Category::factory()->create();
        foreach (['guest' => $this->client(), 'buyer' => $this->buyer()] as $who => $browser) {
            $browser->get(self::ADMIN)->assertUnauthorized();
            $browser->post(self::ADMIN, ['name' => 'Hacked'])->assertUnauthorized();
            $browser->put(self::ADMIN."/{$category->id}", ['name' => 'Hacked'])->assertUnauthorized();
            $browser->delete(self::ADMIN."/{$category->id}")->assertUnauthorized();
        }
        $this->assertSame($category->name, $category->fresh()->name);
        $this->assertFalse($category->fresh()->trashed());
    }
}
