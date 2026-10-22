<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Address;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * A buyer's saved addresses. Exactly one is the default whenever the buyer has any (MySQL also refuses two): the first
 * address becomes the default, choosing another moves it, and removing the default hands it to the most recent one.
 */
final class AddressBook
{
    public function add(User $user, array $data): Address
    {
        return DB::transaction(function () use ($user, $data) {
            $count = Address::where('user_id', $user->id)->lockForUpdate()->count();
            if ($count >= Address::MAX_PER_BUYER) {
                throw new ApiException(422, 'TOO_MANY_ADDRESSES', 'You can save up to '.Address::MAX_PER_BUYER.' addresses. Remove one first.');
            }
            $address = new Address(Arr::except($data, ['is_default']) + ['country' => 'LB']);
            $address->user_id = $user->id;
            $address->save();
            if ($count === 0 || ! empty($data['is_default'])) {
                $this->makeDefault($user, $address);
            }

            return $address->refresh();
        });
    }

    public function update(User $user, Address $address, array $data): Address
    {
        return DB::transaction(function () use ($user, $address, $data) {
            $address->fill(Arr::except($data, ['is_default']))->save(); // the default only moves through makeDefault()
            if (! empty($data['is_default'])) {
                $this->makeDefault($user, $address);
            }

            return $address->refresh();
        });
    }

    public function makeDefault(User $user, Address $address): void
    {
        DB::transaction(function () use ($user, $address) {
            // Clear first, then set: the unique index never sees two defaults at once.
            Address::where('user_id', $user->id)->where('is_default', true)->whereKeyNot($address->id)->update(['is_default' => false]);
            Address::whereKey($address->id)->where('user_id', $user->id)->update(['is_default' => true]);
        });
    }

    public function remove(User $user, Address $address): void
    {
        DB::transaction(function () use ($user, $address) {
            $wasDefault = $address->is_default;
            $address->delete();
            if ($wasDefault && $next = Address::where('user_id', $user->id)->latest('updated_at')->latest('id')->first()) {
                $this->makeDefault($user, $next);
            }
        });
    }
}
