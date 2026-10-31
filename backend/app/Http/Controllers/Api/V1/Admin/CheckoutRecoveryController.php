<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CheckoutRecovery;
use App\Services\CheckoutRecoveries;
use App\Services\StoreSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Checkouts customers didn't finish (only those who asked to be reminded), and how the reminders did. */
class CheckoutRecoveryController extends Controller
{
    public function index(Request $request, CheckoutRecoveries $recoveries): JsonResponse
    {
        $state = $request->query('state');
        $page = CheckoutRecovery::with('order:id,number,status,total')
            ->when($state === 'open', fn ($q) => $q->open()->where('reminders_sent', 0))
            ->when($state === 'reminded', fn ($q) => $q->open()->where('reminders_sent', '>', 0))
            ->when($state === 'recovered', fn ($q) => $q->whereNotNull('recovered_at'))
            ->when($state === 'closed', fn ($q) => $q->whereNull('recovered_at')->whereNotNull('closed_at'))
            ->latest('last_activity_at')->paginate(30);

        return response()->json([
            'data' => collect($page->items())->map(fn (CheckoutRecovery $r) => [
                'id' => $r->id,
                'state' => $r->state(),
                'first_name' => $r->first_name,
                'channel' => $r->channel,
                'contact' => $r->channel === 'email' ? $r->email : $r->phone, // erased after 30 days
                'item_count' => (int) collect($r->items)->sum('quantity'),
                'subtotal' => (float) $r->subtotal,
                'last_activity_at' => $r->last_activity_at?->toIso8601String(),
                'reminded_at' => $r->reminded_at?->toIso8601String(),
                'opened_at' => $r->opened_at?->toIso8601String(),
                'order' => $r->order ? ['id' => $r->order->id, 'number' => $r->order->number, 'status' => $r->order->status] : null,
            ])->all(),
            'meta' => [
                'total' => $page->total(), 'page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'enabled' => CheckoutRecoveries::enabled(),
                'delay_minutes' => (int) StoreSettings::get('checkout_reminder_delay_minutes'),
                'stats' => $recoveries->stats(),
            ],
        ]);
    }
}
