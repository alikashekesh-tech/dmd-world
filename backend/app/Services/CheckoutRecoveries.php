<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\CheckoutRecovery;
use App\Models\Order;
use App\Models\User;
use App\Notifications\CheckoutReminder;
use App\Services\Messaging\Outbox;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Throwable;

/**
 * Abandoned checkout recovery. Nothing is kept unless the customer ticks "remind me" at checkout; then the browser
 * saves what's in the checkout (items, first name, how to reach them) under a private token. If no order follows
 * within the delay the owner set, one reminder goes, claimed first so it can never go twice. Ordering (with that
 * checkout, or any order from the same email or account) closes it, so nobody is reminded after buying.
 * Personal details are erased 30 days after the last change; the counts stay for the owner's overview.
 */
class CheckoutRecoveries
{
    public const CHANNELS = ['email', 'whatsapp', 'sms'];

    /** Reminders only go about checkouts touched within this window (an old cart isn't worth a message). */
    public const STALE_AFTER_DAYS = 7;

    public const ERASE_AFTER_DAYS = 30;

    public function __construct(private Checkout $checkout, private Outbox $outbox) {}

    public static function enabled(): bool
    {
        return (bool) StoreSettings::get('checkout_reminders_enabled');
    }

    /**
     * Saves (or updates, with its token) the checkout the customer agreed to be reminded about.
     *
     * @param  array{token?: ?string, items: list<array>, first_name?: ?string, email?: ?string, phone?: ?string, channel: string}  $data
     */
    public function save(array $data, ?User $user): CheckoutRecovery
    {
        if (! self::enabled()) {
            throw new ApiException(409, 'REMINDERS_OFF', 'Checkout reminders aren’t offered at the moment.');
        }
        $recovery = ! empty($data['token']) ? CheckoutRecovery::where('token', $data['token'])->open()->first() : null;
        // One waiting checkout per email: a new one replaces the older one still waiting (its token, and so its items,
        // are never handed to whoever typed the same email), so an address can't collect a pile of reminders.
        $email = ($data['email'] ?? null) ? User::normalizeEmail($data['email']) : null;
        if (! $recovery && $email) {
            CheckoutRecovery::where('email', $email)->open()->where('reminders_sent', 0)
                ->update(['closed_at' => now(), 'first_name' => null, 'email' => null, 'phone' => null]);
        }
        $recovery ??= (new CheckoutRecovery)->forceFill(['token' => Str::random(40), 'consented_at' => now()]);
        $priced = $this->checkout->price($data['items']);
        $recovery->forceFill([
            'user_id' => $user?->id ?? $recovery->user_id,
            'first_name' => ($data['first_name'] ?? null) ?: null,
            'email' => ($data['email'] ?? null) ? User::normalizeEmail($data['email']) : null,
            'phone' => ($data['phone'] ?? null) ?: null,
            'channel' => $data['channel'],
            'items' => array_map(fn ($l) => ['product_id' => $l['product_id'], 'variant_id' => $l['variant_id'], 'quantity' => $l['quantity']], $priced['lines']),
            'subtotal' => Money::decimal($priced['subtotal']),
            'last_activity_at' => now(),
        ])->save();

        return $recovery;
    }

    /** The customer unticked "remind me": nothing more is sent, and their details go. */
    public function close(string $token): void
    {
        CheckoutRecovery::where('token', $token)->open()->update(['closed_at' => now(), 'first_name' => null, 'email' => null, 'phone' => null]);
    }

    /** The reminder link was opened: what was in the checkout, to put back in the cart (prices are worked out again). */
    public function open(string $token): CheckoutRecovery
    {
        $recovery = CheckoutRecovery::where('token', $token)->first();
        if (! $recovery || $recovery->closed_at) {
            throw new ApiException(404, 'NOT_FOUND', 'This link has expired. Your cart may still have your items.');
        }
        if ($recovery->recovered_at) {
            throw new ApiException(410, 'ALREADY_ORDERED', 'You already placed this order. Thank you!');
        }
        $recovery->opened_at ??= now();
        $recovery->save();

        return $recovery;
    }

    /** An order was placed: its checkout, and any other open one from the same customer, is done. No reminder follows. */
    public function ordered(Order $order, ?string $token): void
    {
        CheckoutRecovery::query()->open()
            ->where(function ($q) use ($order, $token) {
                $q->where('email', $order->email);
                if ($token) {
                    $q->orWhere('token', $token);
                }
                if ($order->user_id) {
                    $q->orWhere('user_id', $order->user_id);
                }
            })
            ->update(['recovered_at' => now(), 'recovered_order_id' => $order->id]);
    }

    /** For the scheduled run: sends the reminders that are due. Returns how many went. */
    public function sendDue(): int
    {
        if (! self::enabled()) {
            return 0;
        }
        $delay = max(15, (int) StoreSettings::get('checkout_reminder_delay_minutes'));
        $sent = 0;
        CheckoutRecovery::query()->open()->where('reminders_sent', 0)
            ->where('last_activity_at', '<=', now()->subMinutes($delay))
            ->where('last_activity_at', '>=', now()->subDays(self::STALE_AFTER_DAYS))
            ->chunkById(100, function ($due) use (&$sent) {
                foreach ($due as $recovery) {
                    if ($recovery->channel !== 'email' && ! $this->outbox->available($recovery->channel)) {
                        continue; // no WhatsApp/SMS provider: nothing can be sent, so nothing is marked as sent
                    }
                    // At most one reminder a day to the same address or number, however many checkouts name it.
                    $contact = $recovery->channel === 'email' ? ['email', $recovery->email] : ['phone', $recovery->phone];
                    if ($contact[1] && CheckoutRecovery::where($contact[0], $contact[1])->whereKeyNot($recovery->id)->where('reminded_at', '>=', now()->subDay())->exists()) {
                        CheckoutRecovery::whereKey($recovery->id)->update(['closed_at' => now()]);

                        continue;
                    }
                    // Claim it: only the run that flips reminders_sent sends the reminder.
                    $claimed = CheckoutRecovery::whereKey($recovery->id)->open()->where('reminders_sent', 0)
                        ->update(['reminders_sent' => 1, 'reminded_at' => now()]);
                    if ($claimed !== 1) {
                        continue;
                    }
                    if ($this->remind($recovery)) {
                        $sent++;
                    } else {
                        CheckoutRecovery::whereKey($recovery->id)->update(['reminders_sent' => 0, 'reminded_at' => null]);
                    }
                }
            });

        return $sent;
    }

    private function remind(CheckoutRecovery $recovery): bool
    {
        $names = collect($this->checkout->price($recovery->items)['lines'])->pluck('name')->filter()->values()->all();
        if (! $names) {
            CheckoutRecovery::whereKey($recovery->id)->update(['closed_at' => now()]); // nothing left that's sold

            return true;
        }
        $url = config('dmd.frontend_url').'/cart?recover='.$recovery->token;
        try {
            if ($recovery->channel === 'email') {
                if (! $recovery->email) {
                    return false;
                }
                Notification::route('mail', $recovery->email)->notify(new CheckoutReminder($recovery, $names, $url));

                return true;
            }
            $text = 'DMD World: you left '.(count($names) === 1 ? $names[0] : count($names).' items')." in your checkout. Finish your order: {$url}";

            return $this->outbox->send($recovery->channel, (string) $recovery->phone, $text, 'checkout_reminder', $recovery) === 'sent';
        } catch (Throwable $e) {
            Log::warning("Checkout reminder {$recovery->id} failed: {$e->getMessage()}");

            return false;
        }
    }

    /** Erases the personal details of checkouts untouched for 30 days. Returns how many were cleared. */
    public function erase(): int
    {
        return CheckoutRecovery::where('last_activity_at', '<', now()->subDays(self::ERASE_AFTER_DAYS))
            ->where(fn ($q) => $q->whereNotNull('email')->orWhereNotNull('phone')->orWhereNotNull('first_name'))
            ->update(['first_name' => null, 'email' => null, 'phone' => null, 'closed_at' => DB::raw('COALESCE(closed_at, CURRENT_TIMESTAMP)')]);
    }

    /** The owner's overview of the last 30 days. */
    public function stats(): array
    {
        $since = now()->subDays(30);
        $rows = CheckoutRecovery::where('checkout_recoveries.created_at', '>=', $since);

        return [
            'saved' => (clone $rows)->count(),
            'reminded' => (clone $rows)->where('reminders_sent', '>', 0)->count(),
            'recovered_after_reminder' => (clone $rows)->where('reminders_sent', '>', 0)->whereNotNull('recovered_at')->count(),
            'recovered_revenue' => Money::json(Money::cents((string) (clone $rows)->where('reminders_sent', '>', 0)->whereNotNull('recovered_order_id')
                ->join('orders', 'orders.id', '=', 'checkout_recoveries.recovered_order_id')->whereNotIn('orders.status', ['cancelled', 'refunded', 'failed'])
                ->sum('orders.total'))),
        ];
    }
}
