<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockAlert;
use App\Services\Inventory;
use App\Services\Messaging\Outbox;
use App\Services\StockAlerts;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Back-in-stock requests: which sold-out products buyers are waiting for (what to restock first), and each request
 * with its contact, so a phone request can be answered by hand while no WhatsApp/SMS provider is set up.
 */
class StockAlertController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::withTrashed()
            ->whereHas('stockAlerts', fn ($q) => $q->waiting())
            ->withCount(['stockAlerts as waiting' => fn ($q) => $q->waiting()])
            ->orderByDesc('waiting')->orderBy('name')
            ->get(['id', 'name', 'sku', 'status', 'deleted_at', 'track_stock', 'stock_quantity', 'stock_status', 'low_stock_threshold']);

        return response()->json(['data' => $products->map(fn (Product $p) => [
            'product_id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'waiting' => (int) $p->waiting,
            'availability' => Inventory::availability($p), 'stock_quantity' => $p->track_stock ? $p->stock_quantity : null,
            'on_storefront' => $p->isPublished(),
        ])->all()]);
    }

    /** Every request, newest first: waiting (default), notified or cancelled. */
    public function requests(Request $request, Outbox $outbox): JsonResponse
    {
        $status = $request->query('status', 'waiting');
        $page = StockAlert::with(['product:id,name,sku,status,deleted_at,track_stock,stock_quantity,stock_status,low_stock_threshold,variation_attributes',
            'variant:id,product_id,options,is_active,deleted_at,track_stock,stock_quantity,stock_status', 'user:id,first_name,last_name,email,phone'])
            ->when($status === 'waiting', fn ($q) => $q->waiting())
            ->when($status === 'notified', fn ($q) => $q->whereNotNull('notified_at'))
            ->when($status === 'cancelled', fn ($q) => $q->whereNotNull('cancelled_at'))
            ->when($request->integer('product_id') > 0, fn ($q) => $q->where('product_id', $request->integer('product_id')))
            ->latest('id')->paginate(30);

        return response()->json([
            'data' => collect($page->items())->map(fn (StockAlert $a) => $this->present($a))->all(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'automatic' => ['email' => true, 'whatsapp' => $outbox->available('whatsapp'), 'sms' => $outbox->available('sms')]],
        ]);
    }

    /** The owner told the buyer themselves. */
    public function contacted(StockAlert $alert, Request $request, StockAlerts $alerts): JsonResponse
    {
        return response()->json(['data' => $this->present($alerts->markContacted($alert, $request->user('admin'))->load(['product', 'variant', 'user']))]);
    }

    private function present(StockAlert $a): array
    {
        $p = $a->product;
        $v = $a->variant;
        $label = $v && $p ? $v->label($p->variation_attributes) : null;
        $available = $p && ($v ? $v->isSellable() && Inventory::variantAvailable($v) !== 0 : Inventory::availability($p) !== Inventory::OUT_OF_STOCK);
        $name = trim(($a->user?->first_name ?? '').' '.($a->user?->last_name ?? ''));
        $what = $p ? $p->name.($label ? " ({$label})" : '') : 'the product';

        return [
            'id' => $a->id,
            'product' => $p ? ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku] : null,
            'variant' => $v ? ['id' => $v->id, 'label' => $label] : null,
            'channel' => $a->channel,
            'contact' => $a->channel === 'email' ? ($a->email ?: $a->user?->email) : $a->phone,
            'customer' => $a->user ? ['id' => $a->user->id, 'name' => $name !== '' ? $name : null] : null,
            'available_now' => (bool) $available,
            'consented_at' => $a->consented_at?->toIso8601String(),
            'created_at' => $a->created_at?->toIso8601String(),
            'notified_at' => $a->notified_at?->toIso8601String(),
            'notified_by' => $a->notified_by,
            'cancelled_at' => $a->cancelled_at?->toIso8601String(),
            // A chat the owner opens and sends themselves: nothing is sent from here.
            'whatsapp_url' => $a->channel !== 'email' && $a->phone ? Phone::whatsAppUrl($a->phone, "Hello from DMD World! {$what} is back in stock: ".config('dmd.frontend_url')."/product/{$a->product_id}") : null,
        ];
    }
}
