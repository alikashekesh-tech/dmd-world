<?php

namespace Tests\Feature\Import;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\OrderStatusEvent;
use App\Models\Review;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The old store's reviews and order notes (fixtures from the emulator: 48 reviews, approved and held, some with the
 * old storefront's "<strong>Title</strong>" format, and order notes of every kind: status changes, buyer messages,
 * replies to the customer and private notes).
 */
class ReviewAndNoteImportTest extends TestCase
{
    use RefreshDatabase;

    private array $reviews;

    private array $notes;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dmd.import.woocommerce' => ['url' => 'https://old-store.test', 'key' => 'ck_test', 'secret' => 'cs_test']]);
        $this->reviews = $this->fixture('reviews');
        $this->notes = $this->fixture('order-notes');
    }

    private function fixture(string $name): array
    {
        return json_decode(file_get_contents(base_path("tests/Fixtures/woocommerce/{$name}.json")), true);
    }

    private function import(): void
    {
        Http::swap(new Factory(app('events')));
        Http::fake([
            'old-store.test/wp-json/wc/v3/products/categories*' => Http::response($this->fixture('categories'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/products/reviews*' => Http::response($this->reviews, 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/products*' => Http::response($this->fixture('products'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/customers*' => Http::response($this->fixture('customers'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/orders/*/notes*' => fn (Request $r) => Http::response($this->notes[Str::between($r->url(), '/orders/', '/notes')] ?? []),
            'old-store.test/wp-json/wc/v3/orders*' => Http::response($this->fixture('orders'), 200, ['X-WP-TotalPages' => '1']),
        ]);
        $this->artisan('dmd:import')->assertSuccessful();
    }

    public function test_reviews_arrive_with_their_ids_titles_and_approval_state(): void
    {
        $this->import();

        $this->assertSame(count($this->reviews), Review::count());
        $this->assertSame(collect($this->reviews)->where('status', 'approved')->count(), Review::where('status', 'approved')->count());
        $this->assertSame(collect($this->reviews)->where('status', 'hold')->count(), Review::where('status', 'pending')->count());

        $titled = collect($this->reviews)->first(fn ($r) => str_starts_with($r['review'], '<strong>'));
        $r = Review::find($titled['id']);
        $this->assertStringStartsWith($r->title, strip_tags(Str::between($titled['review'], '<strong>', '</strong>')));
        $this->assertStringNotContainsString('<', $r->body, 'old HTML becomes plain text');
        $plain = Review::find(collect($this->reviews)->first(fn ($r) => str_starts_with($r['review'], '<p>'))['id']);
        $this->assertNull($plain->title);

        // Reviewers who are imported customers own their reviews; one per product, extra ones stay unlinked.
        $emails = User::pluck('id', 'email');
        $linkable = collect($this->reviews)->filter(fn ($r) => $emails->has(strtolower($r['reviewer_email'])));
        $pairs = $linkable->unique(fn ($r) => strtolower($r['reviewer_email']).':'.$r['product_id'])->count();
        $this->assertSame($pairs, Review::whereNotNull('user_id')->count());
        $this->assertTrue(Review::whereNull('user_id')->get()->every(fn ($r) => $r->author_email !== null));

        // The storefront shows exactly the approved ones, with the same average.
        $product = collect($this->reviews)->where('status', 'approved')->groupBy('product_id')->sortByDesc(fn ($g) => $g->count())->keys()->first();
        $approved = collect($this->reviews)->where('status', 'approved')->where('product_id', $product);
        $summary = $this->client()->get("/api/v1/products/{$product}/reviews")->assertOk()->json('meta.summary');
        $this->assertSame([$approved->count(), round($approved->avg('rating'), 1)], [$summary['count'], (float) $summary['average']]);
        $rating = collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $product)['rating'];
        $this->assertEqualsWithDelta($approved->avg('rating'), $rating['average'], 0.01);
    }

    public function test_order_notes_become_conversations_and_history(): void
    {
        $this->import();
        $all = collect($this->notes)->flatten(1);
        $talk = $all->filter(fn ($n) => $n['customer_note'] || str_starts_with($n['note'], '[Buyer message] '));

        // Every buyer message and reply kept its id, in a conversation per order (the fixture's are all registered buyers).
        $this->assertEqualsCanonicalizing($talk->pluck('id')->all(), Message::pluck('id')->all());
        $this->assertSame(collect($this->notes)->filter(fn ($ns) => collect($ns)->contains(fn ($n) => $n['customer_note'] || str_starts_with($n['note'], '[Buyer message] ')))->count(), Conversation::count());
        $this->assertSame(0, Conversation::query()->unreadForAdmin()->count() + Conversation::query()->unreadForBuyer()->count(), 'imported history isn’t new mail');

        // Status changes and private notes are the order's history, which the buyer never sees.
        $private = $all->first(fn ($n) => ! $n['customer_note'] && ! str_starts_with($n['note'], '[Buyer message] ') && ! str_starts_with($n['note'], 'Order status changed'));
        $this->assertSame($private['note'], OrderStatusEvent::where('legacy_note_id', $private['id'])->value('note'));
        $this->assertSame($all->count() - $talk->count(), OrderStatusEvent::whereNotNull('legacy_note_id')->count());

        // The buyer sees their old conversation in their account after choosing a password.
        $orderId = (int) collect($this->notes)->search(fn ($ns) => collect($ns)->contains(fn ($n) => str_starts_with($n['note'], '[Buyer message] Can you deliver')));
        $c = Conversation::where('order_id', $orderId)->firstOrFail();
        $user = User::find($c->user_id);
        $user->forceFill(['password' => UserFactory::DEFAULT_PASSWORD])->save();
        $buyer = $this->buyer($user);
        $thread = $buyer->get("/api/v1/account/conversations/{$c->id}")->assertOk();
        $this->assertSame(['you', 'store'], array_column($thread->json('data.messages'), 'from'));
        $this->assertSame('Can you deliver after 6pm?', $thread->json('data.messages.0.body'));
        $this->assertNotContains($private['note'], array_column($buyer->get("/api/v1/orders/{$orderId}")->json('data.history') ?? [], 'note'));
    }

    public function test_importing_again_updates_instead_of_duplicating(): void
    {
        $this->import();
        $counts = [Review::count(), Conversation::count(), Message::count(), OrderStatusEvent::count()];

        $this->reviews[0]['status'] = 'approved';
        $this->reviews[0]['rating'] = 1;
        $this->import();

        $this->assertSame($counts, [Review::count(), Conversation::count(), Message::count(), OrderStatusEvent::count()]);
        $this->assertSame(['approved', 1], [Review::find($this->reviews[0]['id'])->status, Review::find($this->reviews[0]['id'])->rating]);
    }
}
