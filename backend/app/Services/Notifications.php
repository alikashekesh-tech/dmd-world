<?php

namespace App\Services;

use App\Models\Admin;
use App\Models\Conversation;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The owner's notifications, worked out from the data each time (never stored): new and late orders, unread
 * conversations, stock running out, reviews waiting. Only what the owner did with them is stored: when they last
 * looked (admins.notifications_seen_at) and which ones they dismissed. Each list is capped, so a busy day can't
 * turn this into a slow request.
 */
final class Notifications
{
    private const CAP = 50;

    /** @return list<array{key: string, kind: string, level: string, title: string, text: ?string, at: ?string, link: array, unseen: bool}> */
    public function list(Admin $admin): array
    {
        $items = [];
        $orders = Order::query()->where('placed_at', '>=', now()->subDays(3))->where('status', '<>', 'failed')
            ->withSum('items as units', 'quantity')->latest('placed_at')->limit(self::CAP)->get();
        foreach ($orders as $o) {
            $items[] = $this->item("order-{$o->id}", 'order', 'info', "New order #{$o->number}",
                ($o->customerName() ?: $o->email).' · $'.Money::decimal(Money::cents($o->total)).' · '.Str::plural('item', (int) $o->units, true), $o->placed_at, ['type' => 'order', 'id' => $o->id]);
        }
        foreach (Order::query()->where('status', 'pending')->where('placed_at', '<', now()->subDay())->oldest('placed_at')->limit(self::CAP)->get() as $o) {
            $items[] = $this->item("late-{$o->id}", 'order', 'warn', "Order #{$o->number} has been pending for over a day", $o->customerName() ?: $o->email,
                $o->placed_at?->copy()->addDay(), ['type' => 'order', 'id' => $o->id]);
        }
        foreach (Conversation::query()->unreadForAdmin()->with(['user:id,first_name,last_name,email', 'latestMessage'])->orderByDesc('last_message_at')->limit(self::CAP)->get() as $c) {
            $items[] = $this->item("msg-{$c->id}-{$c->last_buyer_message_id}", 'message', 'info', ($c->user?->fullName() ?: 'A buyer')." wrote about {$c->subject}",
                $c->latestMessage ? Str::limit($c->latestMessage->body, 120) : null, $c->last_message_at, ['type' => 'conversation', 'id' => $c->id]);
        }
        foreach (['out' => 'danger', 'low' => 'warn'] as $level => $tone) {
            $q = Product::published();
            ProductQuery::stockLevel($q, $level);
            foreach ($q->latest('updated_at')->limit(self::CAP)->get(['id', 'name', 'stock_quantity', 'track_stock', 'updated_at']) as $p) {
                $items[] = $this->item("{$level}-{$p->id}", 'stock', $tone, $level === 'out' ? "{$p->name} is out of stock" : "{$p->name} is running low",
                    $level === 'out' ? 'Restock it or hide it from the shop.' : "{$p->stock_quantity} left", $p->updated_at, ['type' => 'inventory', 'id' => $p->id]);
            }
        }
        foreach (Review::query()->where('status', 'pending')->with('product:id,name')->latest('created_at')->limit(self::CAP)->get() as $r) {
            $items[] = $this->item("rev-{$r->id}", 'review', $r->rating <= 2 ? 'warn' : 'info', "{$r->author_name}’s {$r->rating}★ review is waiting",
                $r->product?->name, $r->created_at, ['type' => 'review', 'id' => $r->id]);
        }

        $dismissed = DB::table('dismissed_notifications')->where('admin_id', $admin->id)->pluck('notification_key')->flip();
        $seen = $admin->notifications_seen_at?->getTimestamp() ?? 0;
        $items = array_values(array_filter($items, fn ($i) => ! $dismissed->has($i['key'])));
        foreach ($items as &$i) {
            $i['unseen'] = $i['at'] !== null && strtotime($i['at']) > $seen;
        }
        unset($i);
        usort($items, fn ($a, $b) => strcmp((string) $b['at'], (string) $a['at']));

        return $items;
    }

    public function markSeen(Admin $admin): void
    {
        $admin->forceFill(['notifications_seen_at' => now()])->save();
    }

    public function dismiss(Admin $admin, string $key): void
    {
        DB::table('dismissed_notifications')->insertOrIgnore(['admin_id' => $admin->id, 'notification_key' => $key, 'created_at' => now()]);
        // Keep the newest 500: older keys belong to things long gone.
        $keep = DB::table('dismissed_notifications')->where('admin_id', $admin->id)->orderByDesc('id')->limit(500)->pluck('id');
        DB::table('dismissed_notifications')->where('admin_id', $admin->id)->whereNotIn('id', $keep->all() ?: [0])->delete();
    }

    private function item(string $key, string $kind, string $level, string $title, ?string $text, mixed $at, array $link): array
    {
        return ['key' => $key, 'kind' => $kind, 'level' => $level, 'title' => $title, 'text' => $text, 'at' => $at?->toIso8601String(), 'link' => $link];
    }
}
