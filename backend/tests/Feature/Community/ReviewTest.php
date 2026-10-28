<?php

namespace Tests\Feature\Community;

use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/** Product reviews: one per buyer and product, owned by their writer, shown only once the owner approves them. */
class ReviewTest extends TestCase
{
    use RefreshDatabase;

    private function write(SpaClient $buyer, Product $p, array $over = [])
    {
        return $buyer->post('/api/v1/account/reviews', [
            'product_id' => $p->id, 'rating' => 5, 'title' => 'Works great', 'body' => 'Exactly as described and arrived quickly.', ...$over,
        ]);
    }

    private function rating(SpaClient $browser, Product $p): ?array
    {
        return collect($browser->get('/api/v1/catalog')->json('products'))->firstWhere('id', $p->id)['rating'];
    }

    public function test_a_review_waits_for_the_owner_then_appears_with_the_rating(): void
    {
        $p = Product::factory()->create();
        $buyer = $this->buyer(User::factory()->create(['first_name' => 'Rana', 'last_name' => 'Khoury']));
        $visitor = $this->client();

        $r = $this->write($buyer, $p)->assertCreated()
            ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.author', 'Rana K.')->assertJsonPath('data.verified_purchase', false);
        $id = $r->json('data.id');
        $this->assertGreaterThanOrEqual(100000, $id);

        // Not public yet: not listed, not counted.
        $visitor->get("/api/v1/products/{$p->id}/reviews")->assertOk()->assertJsonPath('meta.summary.count', 0)->assertJsonCount(0, 'data');
        $this->assertEquals(['average' => 0, 'count' => 0], $this->rating($visitor, $p));

        $this->owner()->put("/api/v1/admin/reviews/{$id}", ['status' => 'approved'])->assertOk()
            ->assertJsonPath('data.status', 'approved')->assertJsonPath('data.moderated_by', 'DMD World');

        $list = $visitor->get("/api/v1/products/{$p->id}/reviews")->assertOk();
        $list->assertJsonPath('meta.summary.count', 1)->assertJsonPath('meta.summary.average', 5)
            ->assertJsonPath('meta.summary.breakdown.0', ['stars' => 5, 'count' => 1])
            ->assertJsonPath('data.0.title', 'Works great')->assertJsonPath('data.0.author', 'Rana K.');
        $this->assertSame(['id', 'rating', 'title', 'body', 'author', 'verified_purchase', 'created_at'], array_keys($list->json('data.0')), 'no email or account id in public reviews');
        // The catalog the storefront already holds is refreshed at once (ratings are part of it).
        $this->assertEquals(['average' => 5, 'count' => 1], $this->rating($visitor, $p));
    }

    public function test_one_review_per_buyer_per_product(): void
    {
        $p = Product::factory()->create();
        $user = User::factory()->create();
        $phone = $this->buyer($user);
        $laptop = $this->buyer($user);

        $this->write($phone, $p)->assertCreated();
        $this->write($laptop, $p, ['title' => 'Second try'])->assertStatus(409)->assertJsonPath('error.code', 'ALREADY_REVIEWED');
        $this->assertSame(1, Review::count());

        // Another product, another buyer: fine.
        $this->write($phone, Product::factory()->create())->assertCreated();
        $this->write($this->buyer(), $p)->assertCreated();
    }

    public function test_a_buyer_manages_only_their_own_review(): void
    {
        $p = Product::factory()->create();
        $alice = $this->buyer();
        $bob = $this->buyer();
        $id = $this->write($alice, $p)->json('data.id');
        $this->owner()->put("/api/v1/admin/reviews/{$id}", ['status' => 'approved'])->assertOk();

        // Bob can't see, change or delete Alice's review.
        $this->assertSame([], $bob->get('/api/v1/account/reviews')->json('data'));
        $bob->put("/api/v1/account/reviews/{$id}", ['rating' => 1, 'title' => 'Hijacked', 'body' => 'This is not my review at all.'])->assertNotFound();
        $bob->delete("/api/v1/account/reviews/{$id}")->assertNotFound();
        $this->assertSame(['approved', 5], [Review::find($id)->status, Review::find($id)->rating]);

        // Alice edits: the new text waits for the owner again, and her old rating stops counting meanwhile.
        $alice->put("/api/v1/account/reviews/{$id}", ['rating' => 3, 'title' => 'Changed my mind', 'body' => 'It stopped charging after a month.'])
            ->assertOk()->assertJsonPath('data.status', 'pending')->assertJsonPath('data.rating', 3);
        $this->assertSame(0, $this->client()->get("/api/v1/products/{$p->id}/reviews")->json('meta.summary.count'));
        $alice->put("/api/v1/account/reviews/{$id}", ['product_id' => 999, 'rating' => 3, 'title' => 'Moving it', 'body' => 'Trying to move it elsewhere.'])->assertStatus(422);

        $this->assertSame([$id], array_column($alice->get("/api/v1/account/reviews?product={$p->id}")->json('data'), 'id'));
        $alice->delete("/api/v1/account/reviews/{$id}")->assertNoContent();
        $this->assertSame(0, Review::count());
        $this->write($alice, $p)->assertCreated(); // and she may write a new one
    }

    public function test_a_buyer_who_bought_it_is_marked_verified(): void
    {
        Notification::fake();
        $p = Product::factory()->create();
        $buyer = $this->buyer();
        $order = $buyer->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->json('data.id');

        // A pending order isn't a purchase yet; once the owner confirms it, it is.
        $other = Product::factory()->create();
        $this->write($buyer, $other)->assertJsonPath('data.verified_purchase', false);
        $this->owner()->put("/api/v1/admin/orders/{$order}/status", ['status' => 'processing'])->assertOk();
        $this->write($buyer, $p)->assertCreated()->assertJsonPath('data.verified_purchase', true);
    }

    public function test_input_is_validated_and_text_is_stored_and_served_as_plain_text(): void
    {
        $p = Product::factory()->create();
        $buyer = $this->buyer();

        $this->write($buyer, $p, ['rating' => 6])->assertStatus(422)->assertJsonPath('error.fields.rating.0', 'Choose a rating from 1 to 5 stars.');
        $this->write($buyer, $p, ['rating' => 0])->assertStatus(422);
        $this->write($buyer, $p, ['title' => 'ok'])->assertStatus(422);
        $this->write($buyer, $p, ['body' => 'Too short'])->assertStatus(422);
        $this->write($buyer, $p, ['body' => str_repeat('a', 5001)])->assertStatus(422);
        $this->write($buyer, Product::factory()->draft()->create())->assertNotFound();
        $this->write($buyer, $p, ['product_id' => 987654321])->assertNotFound();
        $this->client()->post('/api/v1/account/reviews', ['product_id' => $p->id, 'rating' => 5, 'title' => 'Guest', 'body' => 'Guests cannot review products.'])->assertUnauthorized();

        $script = '<script>alert("x")</script> I <3 it & so will you';
        $r = $this->write($buyer, $p, ['title' => "<b>Bold</b>\nclaim\u{202E}", 'body' => "{$script}\u{0007}\r\n\r\n\r\n\r\nSecond paragraph."])->assertCreated();
        // Kept as the characters typed (minus invisible control characters), served as a JSON string, never as HTML.
        $r->assertJsonPath('data.title', '<b>Bold</b> claim')->assertJsonPath('data.body', "{$script}\n\nSecond paragraph.");
        $this->assertStringStartsWith('application/json', $r->headers->get('Content-Type'));
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'));
    }

    public function test_the_owner_moderates_and_buyers_cannot(): void
    {
        $p = Product::factory()->create();
        $ids = collect(range(1, 4))->map(fn ($i) => $this->write($this->buyer(), $p, ['rating' => $i + 1])->json('data.id'));
        $owner = $this->owner();

        $owner->put("/api/v1/admin/reviews/{$ids[0]}", ['status' => 'approved'])->assertOk();
        $owner->put("/api/v1/admin/reviews/{$ids[1]}", ['status' => 'rejected'])->assertOk();
        $owner->put("/api/v1/admin/reviews/{$ids[2]}", ['status' => 'spam'])->assertOk();
        $owner->put("/api/v1/admin/reviews/{$ids[3]}", ['status' => 'published'])->assertStatus(422);

        $list = $owner->get('/api/v1/admin/reviews?status=pending')->assertOk();
        $this->assertSame([$ids[3]], array_column($list->json('data'), 'id'));
        $this->assertSame(['pending' => 1, 'approved' => 1, 'rejected' => 1, 'spam' => 1, 'all' => 4], $list->json('meta.counts'));
        $this->assertSame(1, $this->client()->get("/api/v1/products/{$p->id}/reviews")->json('meta.summary.count'), 'only the approved one is public');

        // A spam review stays spam even if its author edits it.
        $spammer = User::find(Review::find($ids[2])->user_id);
        $this->buyer($spammer)->put("/api/v1/account/reviews/{$ids[2]}", ['rating' => 5, 'title' => 'Try again', 'body' => 'Buy cheap followers at my site now.'])
            ->assertOk()->assertJsonPath('data.status', 'spam');

        $owner->delete("/api/v1/admin/reviews/{$ids[1]}")->assertNoContent();
        $this->assertNull(Review::find($ids[1]));

        $buyer = $this->buyer();
        $buyer->get('/api/v1/admin/reviews')->assertUnauthorized();
        $buyer->put("/api/v1/admin/reviews/{$ids[3]}", ['status' => 'approved'])->assertUnauthorized();
        $this->client()->get('/api/v1/admin/reviews')->assertUnauthorized();
        $this->assertSame('pending', Review::find($ids[3])->status);
    }

    public function test_reviews_of_hidden_products_are_not_public(): void
    {
        $p = Product::factory()->create();
        $id = $this->write($this->buyer(), $p)->json('data.id');
        $this->owner()->put("/api/v1/admin/reviews/{$id}", ['status' => 'approved'])->assertOk();

        $p->update(['status' => 'draft']);
        $this->client()->get("/api/v1/products/{$p->id}/reviews")->assertNotFound();
        $this->client()->get('/api/v1/products/987654321/reviews')->assertNotFound();
    }
}
