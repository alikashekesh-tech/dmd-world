<?php

namespace Tests\Feature\Account;

use App\Models\Address;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AddressTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/account/addresses';

    private function form(array $over = []): array
    {
        return ['label' => 'Home', 'first_name' => 'Rima', 'last_name' => 'Haddad', 'phone' => '+961 70 123 456', 'city' => 'Beirut', 'area' => 'Hamra', 'street' => 'Bliss Street', 'building' => 'Rose Bldg', 'floor' => '3', 'notes' => 'Ring twice', ...$over];
    }

    public function test_address_book_with_exactly_one_default(): void
    {
        $user = User::factory()->create();
        $browser = $this->buyer($user);

        $home = $browser->post(self::URL, $this->form())->assertCreated()->assertJsonPath('data.is_default', true)->assertJsonPath('data.country', 'LB')->json('data.id');
        $work = $browser->post(self::URL, $this->form(['label' => 'Work', 'street' => 'Weygand Street']))->assertCreated()->assertJsonPath('data.is_default', false)->json('data.id');

        $browser->post(self::URL."/{$work}/default")->assertOk()->assertJsonPath('data.is_default', true);
        $this->assertSame([$work], Address::where('user_id', $user->id)->where('is_default', true)->pluck('id')->all());
        $this->assertSame($work, $browser->get(self::URL)->json('data.0.id'), 'the default is listed first');

        $browser->patch(self::URL."/{$home}", ['floor' => '5', 'is_default' => true])->assertOk()->assertJsonPath('data.floor', '5');
        $this->assertSame([$home], Address::where('user_id', $user->id)->where('is_default', true)->pluck('id')->all());

        // Removing the default hands it to the remaining address.
        $browser->delete(self::URL."/{$home}")->assertNoContent();
        $this->assertTrue(Address::find($work)->is_default);
    }

    public function test_mysql_itself_refuses_a_second_default(): void
    {
        $user = User::factory()->create();
        Address::factory()->for($user)->create(['is_default' => true]);

        $this->expectException(UniqueConstraintViolationException::class);
        DB::table('addresses')->insert(Address::factory()->for($user)->make(['is_default' => true])->getAttributes() + ['created_at' => now(), 'updated_at' => now()]);
    }

    public function test_addresses_are_validated(): void
    {
        $browser = $this->buyer();
        $browser->post(self::URL, [])->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['first_name', 'last_name', 'phone', 'city', 'street']]]);
        $browser->post(self::URL, $this->form(['country' => 'Lebanon']))->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['country']]]);
        $browser->post(self::URL, $this->form(['notes' => '<script>alert(1)</script>']))->assertStatus(422)->assertJsonPath('error.fields.notes.0', 'Leave out < and >.');
        $browser->post(self::URL, $this->form(['country' => 'fr']))->assertCreated()->assertJsonPath('data.country', 'FR');
    }

    public function test_a_buyer_can_keep_ten_addresses(): void
    {
        $user = User::factory()->create();
        Address::factory()->for($user)->count(10)->create();
        $this->buyer($user)->post(self::URL, $this->form())->assertStatus(422)->assertJsonPath('error.code', 'TOO_MANY_ADDRESSES');
    }

    public function test_buyer_a_can_never_reach_buyer_bs_addresses(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $bobs = Address::factory()->for($bob)->create(['is_default' => true, 'street' => 'Bob Street']);
        $browser = $this->buyer($alice);

        $this->assertSame([], $browser->get(self::URL)->assertOk()->json('data'));
        $browser->patch(self::URL."/{$bobs->id}", ['street' => 'Hacked'])->assertNotFound();
        $browser->post(self::URL."/{$bobs->id}/default")->assertNotFound();
        $browser->delete(self::URL."/{$bobs->id}")->assertNotFound();
        // Sending Bob's id as the owner of a new address doesn't work either.
        $mine = $browser->post(self::URL, $this->form(['user_id' => $bob->id]))->assertCreated()->json('data.id');

        $this->assertSame('Bob Street', $bobs->fresh()->street);
        $this->assertTrue($bobs->fresh()->is_default);
        $this->assertSame($alice->id, Address::find($mine)->user_id);
    }

    public function test_addresses_need_a_buyer_session(): void
    {
        $this->client()->get(self::URL)->assertUnauthorized();
        $this->client()->post(self::URL, $this->form())->assertUnauthorized();
        $this->owner()->get(self::URL)->assertUnauthorized();
    }
}
