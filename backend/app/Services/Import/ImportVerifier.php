<?php

namespace App\Services\Import;

use App\Models\Coupon;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Carbon;

/**
 * Compares the old store with MySQL after an import, record by record, before the old store is retired. Read-only on
 * both sides. A difference the owner made on purpose in the new system since the import (stock moved by orders or
 * stock changes, an edited product, a moderated review) is reported separately from a real mismatch.
 */
final class ImportVerifier
{
    private const ORDER_STATUS = ['pending' => 'pending', 'processing' => 'processing', 'on-hold' => 'on_hold', 'completed' => 'completed', 'cancelled' => 'cancelled', 'refunded' => 'refunded', 'failed' => 'failed'];

    private const REVIEW_STATUS = ['approved' => 'approved', 'hold' => 'pending'];

    /** @return array<string, array{source: int, found: int, matched: int, changed_since: int, missing: list<string>, mismatched: list<string>}> */
    public function verify(array $source): array
    {
        return array_filter([
            'products' => isset($source['products']) ? $this->products($source['products']) : null,
            'customers' => isset($source['customers']) ? $this->customers($source['customers']) : null,
            'orders' => isset($source['orders']) ? $this->orders($source['orders']) : null,
            'reviews' => isset($source['reviews']) ? $this->reviews($source['reviews']) : null,
            'coupons' => isset($source['coupons']) ? $this->coupons($source['coupons']) : null,
        ]);
    }

    private function products(array $rows): array
    {
        $r = $this->blank(count($rows));
        $mysql = Product::withTrashed()->with('images:id,product_id,url,position')->whereKey(array_column($rows, 'id'))->get()->keyBy('id');
        // Stock changed by anything but the import (orders, cancellations, the owner) is a change made since.
        $moved = InventoryMovement::where('reason', '!=', 'import')->whereIn('product_id', $mysql->keys())->distinct()->pluck('product_id')->flip();
        foreach ($rows as $w) {
            $p = $mysql->get($w['id']);
            if (! $p) {
                $r['missing'][] = "product {$w['id']} {$w['name']}";

                continue;
            }
            $r['found']++;
            $regular = Money::cents($w['regular_price'] ?? '') ?: Money::cents($w['price'] ?? '');
            $sale = Money::cents($w['sale_price'] ?? '');
            $images = array_values(array_filter(array_column($w['images'] ?? [], 'src')));
            $problems = [];
            if ($p->name !== html_entity_decode((string) $w['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8')) {
                $problems[] = 'name';
            }
            if (Money::cents($p->regular_price) !== $regular) {
                $problems[] = 'regular price';
            }
            if (($p->sale_price !== null ? Money::cents($p->sale_price) : null) !== ($sale > 0 && $sale < $regular ? $sale : null)) {
                $problems[] = 'sale price';
            }
            if (count($images) !== $p->images->count() || ($images[0] ?? null) !== $p->images->first()?->url) {
                $problems[] = 'images';
            }
            $stockDiffers = ($w['manage_stock'] ?? false) && (int) ($w['stock_quantity'] ?? 0) !== $p->stock_quantity;
            $edited = $p->updated_at && ! empty($w['date_modified_gmt']) && $p->updated_at->gt(Carbon::parse($w['date_modified_gmt'], 'UTC')->addMinute());
            if (! $problems && ! $stockDiffers) {
                $r['matched']++;
            } elseif ((! $problems || $edited) && (! $stockDiffers || $moved->has($p->id))) {
                $r['changed_since']++; // the owner or the shop changed it in the new system since the import
            } else {
                $r['mismatched'][] = "product {$p->id}: ".implode(', ', [...$problems, ...($stockDiffers ? ["stock {$p->stock_quantity} vs {$w['stock_quantity']}"] : [])]);
            }
        }

        return $r;
    }

    private function customers(array $rows): array
    {
        $r = $this->blank(count($rows));
        $mysql = User::whereKey(array_column($rows, 'id'))->get(['id', 'email'])->keyBy('id');
        foreach ($rows as $w) {
            $u = $mysql->get($w['id']);
            if (! $u) {
                $r['missing'][] = "customer {$w['id']} {$w['email']}";

                continue;
            }
            $r['found']++;
            User::normalizeEmail($w['email']) === $u->email ? $r['matched']++ : $r['changed_since']++; // the owner or buyer changed the email
        }

        return $r;
    }

    private function orders(array $rows): array
    {
        $r = $this->blank(count($rows));
        $mysql = Order::whereKey(array_column($rows, 'id'))->withCount('items')->get()->keyBy('id');
        foreach ($rows as $w) {
            $o = $mysql->get($w['id']);
            if (! $o) {
                $r['missing'][] = "order {$w['id']}";

                continue;
            }
            $r['found']++;
            $problems = [];
            if ($o->number !== (string) ($w['number'] ?? $w['id'])) {
                $problems[] = 'number';
            }
            if (Money::cents($o->total) !== Money::cents($w['total'] ?? 0)) {
                $problems[] = 'total';
            }
            if ($o->items_count !== count($w['line_items'] ?? [])) {
                $problems[] = 'lines';
            }
            $statusMoved = (self::ORDER_STATUS[$w['status']] ?? null) !== $o->status;
            if (! $problems && ! $statusMoved) {
                $r['matched']++;
            } elseif (! $problems && $o->history()->whereNull('legacy_note_id')->where('note', '!=', 'Imported from the old store')->exists()) {
                $r['changed_since']++; // its status was changed in the new admin since
            } else {
                $r['mismatched'][] = "order {$o->id}: ".implode(', ', [...$problems, ...($statusMoved ? ["status {$o->status} vs {$w['status']}"] : [])]);
            }
        }

        return $r;
    }

    private function reviews(array $rows): array
    {
        $r = $this->blank(count($rows));
        $mysql = Review::whereKey(array_column($rows, 'id'))->get()->keyBy('id');
        foreach ($rows as $w) {
            $v = $mysql->get($w['id']);
            if (! $v) {
                $r['missing'][] = "review {$w['id']}";

                continue;
            }
            $r['found']++;
            if ($v->rating !== (int) $w['rating']) {
                $r['mismatched'][] = "review {$v->id}: rating {$v->rating} vs {$w['rating']}";
            } elseif ((self::REVIEW_STATUS[$w['status']] ?? null) === $v->status) {
                $r['matched']++;
            } elseif ($v->moderated_at) {
                $r['changed_since']++; // moderated in the new admin
            } else {
                $r['mismatched'][] = "review {$v->id}: status {$v->status} vs {$w['status']}";
            }
        }

        return $r;
    }

    private function coupons(array $rows): array
    {
        $r = $this->blank(count($rows));
        $mysql = Coupon::withTrashed()->whereKey(array_column($rows, 'id'))->get()->keyBy('id');
        foreach ($rows as $w) {
            $c = $mysql->get($w['id']);
            if (! $c) {
                $r['missing'][] = "coupon {$w['id']} {$w['code']}";

                continue;
            }
            $r['found']++;
            Coupon::normalize($w['code']) === $c->code && Money::cents($w['amount']) === Money::cents($c->amount)
                ? $r['matched']++ : $r['changed_since']++;
        }

        return $r;
    }

    private function blank(int $source): array
    {
        return ['source' => $source, 'found' => 0, 'matched' => 0, 'changed_since' => 0, 'missing' => [], 'mismatched' => []];
    }
}
