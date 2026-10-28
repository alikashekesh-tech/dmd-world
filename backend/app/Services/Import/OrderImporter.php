<?php

namespace App\Services\Import;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusEvent;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use App\Support\Text;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Brings the old store's orders into MySQL as history: same ids and numbers, statuses, totals, the buyer's account
 * (when it was imported) and every line with the product name, SKU and price it was sold at. Importing an old order
 * never touches today's stock. Run after products and customers; running it again updates the same orders.
 */
final class OrderImporter
{
    private const STATUS = ['pending' => 'pending', 'processing' => 'processing', 'on-hold' => 'on_hold', 'completed' => 'completed', 'cancelled' => 'cancelled', 'refunded' => 'refunded', 'failed' => 'failed'];

    private const PAYMENT = ['cod' => 'cod', 'bacs' => 'bank_transfer'];

    private array $stats = ['orders' => 0, 'items' => 0, 'skipped' => 0];

    /** @var list<string> */
    public array $warnings = [];

    public function import(array $wooOrders): array
    {
        $users = User::pluck('id')->flip();
        $products = Product::withTrashed()->pluck('id')->flip();
        $tracked = Product::withTrashed()->where('track_stock', true)->pluck('id')->flip();

        foreach ($wooOrders as $w) {
            $id = (int) ($w['id'] ?? 0);
            $status = self::STATUS[$w['status'] ?? ''] ?? null;
            if (! $id || ! $status) {
                $this->stats['skipped']++;
                $this->warnings[] = "Skipped order {$id} (status ".($w['status'] ?? '?').')';

                continue;
            }
            $billing = $w['billing'] ?? [];
            $ship = ! empty($w['shipping']['address_1']) ? $w['shipping'] : $billing;
            $total = Money::cents($w['total'] ?? 0);
            $discount = Money::cents($w['discount_total'] ?? 0);
            $shipping = Money::cents($w['shipping_total'] ?? 0);
            $placed = Carbon::parse($w['date_created_gmt'] ?? $w['date_created'] ?? 'now', 'UTC');
            $pickup = ($w['shipping_lines'][0]['method_id'] ?? '') === 'local_pickup';

            $order = Order::find($id) ?? new Order;
            $order->timestamps = false;
            $order->forceFill([
                'id' => $id,
                'number' => (string) ($w['number'] ?? $id),
                'user_id' => ! empty($w['customer_id']) && $users->has((int) $w['customer_id']) ? (int) $w['customer_id'] : null,
                'status' => $status,
                'currency' => strtoupper((string) ($w['currency'] ?? 'USD')),
                // The totals as the old store charged them (anything else on the bill, like tax, is folded into the subtotal).
                'subtotal' => Money::decimal(max(0, $total + $discount - $shipping)),
                'discount_total' => Money::decimal($discount),
                'shipping_total' => Money::decimal($shipping),
                'total' => Money::decimal($total),
                'payment_method' => self::PAYMENT[$w['payment_method'] ?? ''] ?? Str::limit((string) ($w['payment_method'] ?: 'cod'), 20, ''),
                'payment_status' => $status === 'refunded' ? 'refunded' : ($status === 'completed' || ! empty($w['date_paid']) ? 'paid' : 'unpaid'),
                'delivery_method' => $pickup ? 'pickup' : 'delivery',
                'first_name' => Str::limit(trim((string) ($billing['first_name'] ?? '')) ?: 'Guest', 60, ''),
                'last_name' => Str::limit(trim((string) ($billing['last_name'] ?? '')), 60, ''),
                'email' => User::normalizeEmail($billing['email'] ?? '') ?: "order-{$id}@unknown.invalid",
                'phone' => Str::limit(trim((string) ($billing['phone'] ?? '')), 30, ''),
                'ship_country' => $pickup ? null : (strtoupper(substr((string) ($ship['country'] ?? 'LB'), 0, 2)) ?: 'LB'),
                'ship_city' => $pickup ? null : (Str::limit(Text::plain($ship['city'] ?? ''), 80, '') ?: null),
                'ship_area' => $pickup ? null : (Str::limit(Text::plain($ship['state'] ?? ''), 80, '') ?: null),
                'ship_street' => $pickup ? null : (Str::limit(Text::plain($ship['address_1'] ?? ''), 160, '') ?: null),
                'ship_building' => $pickup ? null : (Str::limit(Text::plain($ship['address_2'] ?? ''), 80, '') ?: null),
                'customer_note' => Text::plain($w['customer_note'] ?? '', 1000) ?: null,
                'coupon_code' => ! empty($w['coupon_lines'][0]['code']) ? Str::limit(strtoupper($w['coupon_lines'][0]['code']), 60, '') : null,
                'placed_at' => $placed,
                'completed_at' => ! empty($w['date_completed_gmt'] ?? $w['date_completed'] ?? null) ? Carbon::parse($w['date_completed_gmt'] ?? $w['date_completed'], 'UTC') : null,
                'cancelled_at' => $status === 'cancelled' ? Carbon::parse($w['date_modified_gmt'] ?? $w['date_created_gmt'] ?? 'now', 'UTC') : null,
                'created_at' => $order->created_at ?? $placed,
                'updated_at' => now(),
            ])->save();
            $order->timestamps = true;

            OrderItem::where('order_id', $id)->delete();
            foreach ($w['line_items'] ?? [] as $line) {
                $qty = max(1, (int) ($line['quantity'] ?? 1));
                $lineTotal = Money::cents($line['total'] ?? 0);
                $lineSubtotal = Money::cents($line['subtotal'] ?? $line['total'] ?? 0);
                $productId = (int) ($line['product_id'] ?? 0);
                (new OrderItem)->forceFill([
                    'order_id' => $id,
                    'product_id' => $products->has($productId) ? $productId : null,
                    'product_name' => Str::limit(html_entity_decode((string) ($line['name'] ?? 'Item'), ENT_QUOTES | ENT_HTML5, 'UTF-8'), 200, ''),
                    'sku' => Str::limit(trim((string) ($line['sku'] ?? '')), 64, '') ?: null,
                    'image_url' => Text::httpUrl($line['image']['src'] ?? null),
                    'unit_price' => Money::decimal(intdiv($lineSubtotal, $qty)),
                    'regular_price' => Money::decimal(intdiv($lineSubtotal, $qty)),
                    'quantity' => $qty,
                    // WooCommerce had taken these units from stock (and the imported stock count shows it) once the order
                    // was processing, on hold or completed: cancelling or refunding it here gives them back.
                    'stock_held' => $tracked->has($productId) && in_array($status, ['processing', 'on_hold', 'completed'], true) ? $qty : 0,
                    'line_subtotal' => Money::decimal($lineSubtotal),
                    'line_discount' => Money::decimal(max(0, $lineSubtotal - $lineTotal)),
                    'line_total' => Money::decimal($lineTotal),
                ])->save();
                $this->stats['items']++;
            }

            if (! OrderStatusEvent::where('order_id', $id)->exists()) {
                (new OrderStatusEvent)->forceFill(['order_id' => $id, 'from_status' => null, 'to_status' => $status, 'actor' => 'system', 'note' => 'Imported from the old store', 'created_at' => $placed])->save();
            }
            $this->stats['orders']++;
        }

        return $this->stats;
    }
}
