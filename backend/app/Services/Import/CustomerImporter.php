<?php

namespace App\Services\Import;

use App\Models\Address;
use App\Models\User;
use App\Support\Text;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Brings the old store's customer accounts into MySQL with their WooCommerce ids. Their WordPress passwords can't be
 * read through the API, so imported accounts have no password: the buyer chooses one with "Forgot password" (the
 * email proves it's them). Their saved address becomes their default address.
 */
final class CustomerImporter
{
    private array $stats = ['customers' => 0, 'addresses' => 0, 'skipped' => 0];

    /** @var list<string> */
    public array $warnings = [];

    public function import(array $wooCustomers): array
    {
        foreach ($wooCustomers as $c) {
            $id = (int) ($c['id'] ?? 0);
            $email = User::normalizeEmail($c['email'] ?? '');
            if (! $id || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $this->stats['skipped']++;
                $this->warnings[] = "Skipped customer {$id} (no valid email)";

                continue;
            }
            if (User::where('email', $email)->whereKeyNot($id)->exists()) {
                $this->stats['skipped']++;
                $this->warnings[] = "Skipped customer {$id}: {$email} already belongs to another account here";

                continue;
            }
            $billing = $c['billing'] ?? [];
            $user = User::find($id) ?? new User;
            $user->timestamps = false;
            $user->forceFill([
                'id' => $id,
                'email' => $email,
                'first_name' => Str::limit(trim((string) ($c['first_name'] ?? $billing['first_name'] ?? '')) ?: 'DMD', 60, ''),
                'last_name' => Str::limit(trim((string) ($c['last_name'] ?? $billing['last_name'] ?? '')) ?: 'Customer', 60, ''),
                'phone' => Str::limit(trim((string) ($billing['phone'] ?? '')), 30, '') ?: null,
                'created_at' => $user->created_at ?? Carbon::parse($c['date_created_gmt'] ?? $c['date_created'] ?? 'now', 'UTC'),
                'updated_at' => now(),
            ]);
            if (! $user->exists) {
                $user->password = null; // chosen by the buyer through "Forgot password"
            }
            $user->save();
            $user->timestamps = true;
            $this->stats['customers']++;

            $ship = ! empty($c['shipping']['address_1']) ? $c['shipping'] : $billing;
            if (! empty($ship['address_1']) && ! Address::where('user_id', $id)->exists()) {
                $address = new Address([
                    'label' => 'Home',
                    'first_name' => $user->first_name, 'last_name' => $user->last_name,
                    'phone' => $user->phone ?: '',
                    'country' => strtoupper(substr((string) ($ship['country'] ?? 'LB'), 0, 2)) ?: 'LB',
                    'city' => Str::limit(Text::plain($ship['city'] ?? '') ?: 'Unknown', 80, ''),
                    'area' => Str::limit(Text::plain($ship['state'] ?? ''), 80, '') ?: null,
                    'street' => Str::limit(Text::plain($ship['address_1']), 160, ''),
                    'building' => Str::limit(Text::plain($ship['address_2'] ?? ''), 80, '') ?: null,
                ]);
                $address->user_id = $id;
                $address->is_default = true;
                $address->save();
                $this->stats['addresses']++;
            }
        }

        return $this->stats;
    }
}
