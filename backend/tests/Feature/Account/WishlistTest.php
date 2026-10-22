<?php

namespace Tests\Feature\Account;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WishlistTest extends TestCase
{
    use RefreshDatabase;

    public function test_saved_products_persist_across_devices_without_duplicates(): void
    {
        $user = User::factory()->create();
        [$a, $b] = Product::factory()->count(2)->create();
        $phone = $this->buyer($user);

        $phone->post('/api/v1/wishlist', ['product_id' => $a->id])->assertCreated()->assertJson(['added' => true]);
        $phone->post('/api/v1/wishlist', ['product_id' => $a->id])->assertOk()->assertJson(['added' => false]);
        $phone->post('/api/v1/wishlist', ['product_id' => $b->id])->assertCreated();
        $this->assertSame(2, DB::table('wishlist_items')->where('user_id', $user->id)->count());

        $laptop = $this->buyer($user);
        $list = $laptop->get('/api/v1/wishlist')->assertOk();
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $list->json('meta.ids'));
        $this->assertSame($a->name, collect($list->json('data'))->firstWhere('id', $a->id)['name']);

        $laptop->delete("/api/v1/wishlist/{$a->id}")->assertNoContent();
        $laptop->delete("/api/v1/wishlist/{$a->id}")->assertNoContent(); // removing twice is harmless
        $this->assertSame([$b->id], $phone->get('/api/v1/wishlist')->json('meta.ids'));
    }

    public function test_hidden_products_drop_out_and_come_back_deleted_ones_go(): void
    {
        $user = User::factory()->create();
        $p = Product::factory()->create();
        $gone = Product::factory()->create();
        $browser = $this->buyer($user);
        $browser->post('/api/v1/wishlist', ['product_id' => $p->id]);
        $browser->post('/api/v1/wishlist', ['product_id' => $gone->id]);

        $p->delete(); // archived by the owner
        $this->assertSame([$gone->id], $browser->get('/api/v1/wishlist')->json('meta.ids'));
        $p->restore();
        $this->assertEqualsCanonicalizing([$p->id, $gone->id], $browser->get('/api/v1/wishlist')->json('meta.ids'));

        $gone->forceDelete();
        $this->assertSame([$p->id], $browser->get('/api/v1/wishlist')->json('meta.ids'));
        $this->assertSame(1, DB::table('wishlist_items')->count());

        $draft = Product::factory()->draft()->create();
        $browser->post('/api/v1/wishlist', ['product_id' => $draft->id])->assertNotFound();
        $browser->post('/api/v1/wishlist', ['product_id' => 999999999])->assertNotFound();
    }

    public function test_a_guest_wishlist_merges_into_the_account(): void
    {
        $user = User::factory()->create();
        $kept = Product::factory()->create();
        $guest = Product::factory()->count(2)->create();
        $draft = Product::factory()->draft()->create();
        $browser = $this->buyer($user);
        $browser->post('/api/v1/wishlist', ['product_id' => $kept->id]);

        $ids = $browser->post('/api/v1/wishlist/merge', ['product_ids' => [...$guest->pluck('id')->all(), $kept->id, $draft->id, 424242]])->assertOk()->json('ids');

        $this->assertEqualsCanonicalizing([$kept->id, ...$guest->pluck('id')->all()], $ids);
        $browser->post('/api/v1/wishlist/merge', ['product_ids' => 'nope'])->assertStatus(422);
    }

    public function test_each_buyer_has_their_own_wishlist(): void
    {
        $p = Product::factory()->create();
        $alice = $this->buyer();
        $bob = $this->buyer();
        $alice->post('/api/v1/wishlist', ['product_id' => $p->id])->assertCreated();

        $this->assertSame([], $bob->get('/api/v1/wishlist')->json('meta.ids'));
        $bob->delete("/api/v1/wishlist/{$p->id}")->assertNoContent();
        $this->assertSame([$p->id], $alice->get('/api/v1/wishlist')->json('meta.ids'), 'Bob removing it changes only his list');
    }

    public function test_the_wishlist_needs_a_buyer_session(): void
    {
        $p = Product::factory()->create();
        $this->client()->get('/api/v1/wishlist')->assertUnauthorized();
        $this->client()->post('/api/v1/wishlist', ['product_id' => $p->id])->assertUnauthorized();
        $this->assertSame(0, DB::table('wishlist_items')->count());
    }
}
