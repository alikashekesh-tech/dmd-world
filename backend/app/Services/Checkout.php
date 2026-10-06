<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Address;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderStatusEvent;
use App\Models\Product;
use App\Models\User;
use App\Notifications\OrderPlaced;
use App\Support\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Cart quotes and order placement. The browser only says which products and how many; every price, discount,
 * stock check and total is worked out here from MySQL. Placing an order is one transaction that locks the product
 * rows, so two buyers can't both get the last unit, and nothing is half-written if anything fails.
 */
final class Checkout
{
    public const MAX_LINES = 30;

    public const MAX_QTY = 10;

    public function __construct(private Inventory $inventory, private Coupons $coupons) {}

    /**
     * Prices cart lines from the products as they are now. With $lock the product rows are locked until the
     * surrounding transaction ends (placing an order).
     *
     * @param  list<array{product_id: int, quantity: int}>  $items
     * @return array{lines: list<array>, subtotal: int, ok: bool}
     */
    public function price(array $items, bool $lock = false): array
    {
        $wanted = [];
        foreach ($items as $item) {
            $wanted[(int) $item['product_id']] = ($wanted[(int) $item['product_id']] ?? 0) + (int) $item['quantity'];
        }
        ksort($wanted); // a fixed lock order: two checkouts can't deadlock on each other's products
        $query = Product::query()->whereKey(array_keys($wanted))->with(['images:id,product_id,url,position', 'categories:id']);
        $products = ($lock ? $query->lockForUpdate() : $query)->get()->keyBy('id');

        $lines = [];
        $subtotal = 0;
        foreach ($wanted as $id => $qty) {
            $p = $products->get($id);
            $line = ['product_id' => $id, 'quantity' => $qty, 'product' => $p, 'name' => $p?->name, 'unit' => 0, 'regular' => 0, 'subtotal' => 0, 'problem' => null, 'code' => null, 'max' => self::MAX_QTY];
            if (! $p || ! $p->isPublished()) {
                [$line['code'], $line['problem'], $line['max']] = ['UNAVAILABLE', ($p->name ?? 'An item in your cart').' is no longer available. Please remove it.', 0];
            } else {
                $available = Inventory::available($p);
                $line['max'] = $available === null ? self::MAX_QTY : min(self::MAX_QTY, $available);
                if ($available === 0) {
                    [$line['code'], $line['problem']] = ['SOLD_OUT', "{$p->name} just sold out. Please remove it."];
                } elseif ($qty > self::MAX_QTY) {
                    [$line['code'], $line['problem']] = ['TOO_MANY', 'Each item can be ordered up to '.self::MAX_QTY.' at a time.'];
                } elseif ($available !== null && $available < $qty) {
                    [$line['code'], $line['problem']] = ['LOW_STOCK', "Only {$available} of {$p->name} left. Please lower the quantity."];
                }
                $price = Pricing::forProduct($p);
                $line['unit'] = $price['price'];
                $line['regular'] = $price['regular'];
                $line['subtotal'] = $price['price'] * $qty;
                if (! $line['problem']) {
                    $subtotal += $line['subtotal'];
                }
            }
            $lines[] = $line;
        }

        return ['lines' => $lines, 'subtotal' => $subtotal, 'ok' => collect($lines)->every(fn ($l) => $l['problem'] === null)];
    }

    /**
     * A quote with an optional discount code. A code that can't be used is reported, never silently dropped.
     *
     * @return array{lines: list<array>, subtotal: int, ok: bool, discount: int, coupon: ?array}
     */
    public function quote(array $items, ?string $code, ?User $user, ?string $email): array
    {
        $priced = $this->price($items);
        $priced['discount'] = 0;
        $priced['coupon'] = null;
        if ($code !== null && trim($code) !== '') {
            try {
                $c = $this->coupons->apply($code, $priced['lines'], $user, $email);
                $priced['discount'] = $c['discount'];
                $priced['coupon'] = ['code' => $c['coupon']->code, 'ok' => true, 'discount' => $c['discount'], 'label' => $c['label'], 'message' => null];
            } catch (ApiException $e) {
                $priced['coupon'] = ['code' => Coupon::normalize($code), 'ok' => false, 'discount' => 0, 'label' => null, 'message' => $e->getMessage(), 'error' => $e->errorCode];
            }
        }

        return $priced;
    }

    /**
     * Places an order. A repeated idempotency key returns the order the first request made (never a second one).
     *
     * @return array{order: Order, guest_token: ?string, replayed: bool}
     */
    public function place(array $data, ?User $user): array
    {
        $key = $data['idempotency_key'];
        $hash = hash('sha256', ($user ? 'u'.$user->id : 'guest').'|'.$key);
        if ($existing = Order::where('idempotency_hash', $hash)->first()) {
            return $this->replay($existing, $data, $user);
        }

        try {
            $order = DB::transaction(fn () => $this->create($data, $user, $hash), 3);
        } catch (UniqueConstraintViolationException $e) {
            // The same submit arrived twice at the same moment and the other one won: answer with its order.
            if ($existing = Order::where('idempotency_hash', $hash)->first()) {
                return $this->replay($existing, $data, $user);
            }
            throw $e;
        }

        Activity::record('order.placed', "{$order->customerName()} placed order #{$order->number} · $".Money::decimal(Money::cents($order->total)), $order, null, $user);
        Notification::route('mail', $order->email)->notify(new OrderPlaced($order));

        return ['order' => $order, 'guest_token' => $user ? null : $this->guestToken($order, $key), 'replayed' => false];
    }

    private function create(array $data, ?User $user, string $hash): Order
    {
        $priced = $this->price($data['items'], lock: true);
        if (! $priced['ok']) {
            $bad = collect($priced['lines'])->firstWhere('problem', '!==', null);
            throw new ApiException(409, $bad['code'], $bad['problem'], ['items' => collect($priced['lines'])->whereNotNull('problem')->map(fn ($l) => "{$l['product_id']}:{$l['code']}")->values()->all()]);
        }

        $contact = $data['contact'];
        $delivery = $data['delivery_method'];
        $ship = $delivery === 'delivery' ? $this->shippingAddress($data, $user) : [];
        // Offers are already in each line's price (Pricing). A code is checked again here with its row locked,
        // so its last allowed use can't be taken by two orders at once.
        $coupon = ! empty($data['coupon']) ? $this->coupons->apply($data['coupon'], $priced['lines'], $user, $contact['email'], lock: true) : null;
        $discount = $coupon['discount'] ?? 0;
        $shipping = 0; // delivery cost is confirmed by DMD with the buyer after the order
        $subtotal = $priced['subtotal'];

        $order = new Order;
        $order->forceFill([
            'number' => 'pending-'.bin2hex(random_bytes(6)), // replaced by the id right below
            'user_id' => $user?->id,
            'status' => 'pending',
            'subtotal' => Money::decimal($subtotal),
            'discount_total' => Money::decimal($discount),
            'shipping_total' => Money::decimal($shipping),
            'total' => Money::decimal($subtotal - $discount + $shipping),
            'payment_method' => $data['payment_method'],
            'payment_status' => 'unpaid',
            'delivery_method' => $delivery,
            'first_name' => $contact['first_name'], 'last_name' => $contact['last_name'],
            'email' => User::normalizeEmail($contact['email']), 'phone' => $contact['phone'],
            'ship_country' => $ship['country'] ?? null, 'ship_city' => $ship['city'] ?? null, 'ship_area' => $ship['area'] ?? null,
            'ship_street' => $ship['street'] ?? null, 'ship_building' => $ship['building'] ?? null, 'ship_floor' => $ship['floor'] ?? null,
            'ship_notes' => $ship['notes'] ?? null,
            'customer_note' => ($data['note'] ?? null) ?: null,
            'coupon_code' => $coupon ? $coupon['coupon']->code : null,
            'idempotency_hash' => $hash,
            'placed_at' => now(),
        ])->save();
        $order->forceFill(['number' => (string) $order->id])->save();

        foreach ($priced['lines'] as $line) {
            $p = $line['product'];
            $lineDiscount = $coupon['lines'][$p->id] ?? 0;
            $order->items()->forceCreate([
                'product_id' => $p->id, 'product_name' => $p->name, 'sku' => $p->sku, 'image_url' => $p->images->first()?->url,
                'unit_price' => Money::decimal($line['unit']), 'regular_price' => Money::decimal($line['regular']), 'quantity' => $line['quantity'],
                'line_subtotal' => Money::decimal($line['subtotal']), 'line_discount' => Money::decimal($lineDiscount), 'line_total' => Money::decimal($line['subtotal'] - $lineDiscount),
            ]);
            if ($p->track_stock) {
                $this->inventory->adjust($p, -$line['quantity'], 'order', null, null, $order->id);
            }
        }

        if ($coupon) {
            $this->coupons->redeem($coupon['coupon'], $order, $discount);
        }
        (new OrderStatusEvent)->forceFill(['order_id' => $order->id, 'from_status' => null, 'to_status' => 'pending', 'actor' => $user ? 'buyer' : 'system', 'note' => 'Order placed'])->save();

        if ($user && $delivery === 'delivery' && empty($data['address_id']) && ! empty($data['save_address'])) {
            $this->saveToAddressBook($user, $contact, $ship);
        }

        return $order;
    }

    /** The delivery address: one of the buyer's saved addresses (checked to be theirs), or the one typed in. */
    private function shippingAddress(array $data, ?User $user): array
    {
        if (! empty($data['address_id'])) {
            $saved = $user ? Address::where('user_id', $user->id)->find($data['address_id']) : null;
            if (! $saved) {
                throw new ApiException(422, 'ADDRESS_NOT_FOUND', 'Choose one of your saved addresses.', ['address_id' => ['Choose one of your saved addresses.']]);
            }

            return $saved->only(['country', 'city', 'area', 'street', 'building', 'floor', 'notes']);
        }
        $a = $data['address'] ?? [];

        return ['country' => strtoupper($a['country'] ?? 'LB'), 'city' => $a['city'], 'area' => $a['area'] ?? null, 'street' => $a['street'],
            'building' => $a['building'] ?? null, 'floor' => $a['floor'] ?? null, 'notes' => $a['notes'] ?? null];
    }

    private function saveToAddressBook(User $user, array $contact, array $ship): void
    {
        if (Address::where('user_id', $user->id)->count() >= Address::MAX_PER_BUYER) {
            return;
        }
        app(AddressBook::class)->add($user, ['first_name' => $contact['first_name'], 'last_name' => $contact['last_name'], 'phone' => $contact['phone']] + array_filter($ship, fn ($v) => $v !== null));
    }

    /** The same submit again: the same order (and, for a guest, the same private link token). */
    private function replay(Order $order, array $data, ?User $user): array
    {
        if (! $user && ! hash_equals($order->email, User::normalizeEmail($data['contact']['email'] ?? ''))) {
            throw new ApiException(409, 'IDEMPOTENCY_CONFLICT', 'This checkout was already used for another order. Refresh the page and try again.');
        }

        return ['order' => $order, 'guest_token' => $user ? null : $this->guestToken($order, $data['idempotency_key']), 'replayed' => true];
    }

    /**
     * A guest's private token for their order: derived from the order and the checkout's idempotency key with the
     * app secret, so only the browser that placed the order can have it (and a retried submit gets it again).
     * Only its SHA-256 is stored.
     */
    private function guestToken(Order $order, string $key): string
    {
        $token = hash_hmac('sha256', $order->id.'|'.$key, (string) config('app.key'));
        if (! $order->guest_token_hash) {
            $order->forceFill(['guest_token_hash' => hash('sha256', $token)])->save();
        }

        return $token;
    }
}
