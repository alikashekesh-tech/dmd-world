<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\OfferRequest;
use App\Models\Offer;
use App\Services\Offers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** Store-wide offers. Saving, switching off or deleting one changes prices at once and never edits a product. */
class OfferController extends Controller
{
    public function __construct(private Offers $offers) {}

    public function index(): JsonResponse
    {
        $offers = Offer::query()->with('targets')->latest('id')->get();
        $covered = $this->coveredCounts($offers->pluck('id')->all());

        return response()->json(['data' => $offers->map(fn (Offer $o) => $this->row($o, $covered[$o->id] ?? 0))->values()]);
    }

    public function show(Offer $offer): JsonResponse
    {
        return response()->json(['data' => $this->row($offer->load('targets'), $this->coveredCounts([$offer->id])[$offer->id] ?? 0)]);
    }

    public function store(OfferRequest $request): JsonResponse
    {
        $offer = $this->offers->save(new Offer, $request->validated(), $request->user('admin'));

        return $this->show($offer)->setStatusCode(201);
    }

    public function update(OfferRequest $request, Offer $offer): JsonResponse
    {
        return $this->show($this->offers->save($offer, $request->validated(), $request->user('admin')));
    }

    /** Switch on or off without changing anything else. */
    public function toggle(Request $request, Offer $offer): JsonResponse
    {
        $v = $request->validate(['is_active' => ['required', 'boolean']]);
        $offer->forceFill(['is_active' => $v['is_active']])->save();

        return $this->show($offer);
    }

    public function destroy(Request $request, Offer $offer): Response
    {
        $this->offers->delete($offer, $request->user('admin'));

        return response()->noContent();
    }

    private function row(Offer $o, int $covered): array
    {
        return [
            'id' => $o->id, 'name' => $o->name, 'label' => $o->label, 'discount_type' => $o->discount_type, 'discount_value' => (float) $o->discount_value,
            'starts_at' => $o->starts_at?->toIso8601String(), 'ends_at' => $o->ends_at?->toIso8601String(),
            'is_active' => $o->is_active, 'state' => $o->state(),
            'product_ids' => $o->targets->where('target_type', 'product')->pluck('target_id')->values(),
            'category_ids' => $o->targets->where('target_type', 'category')->pluck('target_id')->values(),
            'products_covered' => $covered,
            'created_at' => $o->created_at?->toIso8601String(), 'updated_at' => $o->updated_at?->toIso8601String(),
        ];
    }

    /** How many products each offer covers (picked directly or through its categories), in one query. */
    private function coveredCounts(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $in = implode(',', array_map('intval', $ids));

        return collect(DB::select(<<<SQL
            SELECT offer_id, COUNT(DISTINCT product_id) AS n FROM (
                SELECT offer_id, target_id AS product_id FROM offer_targets WHERE target_type = 'product' AND offer_id IN ({$in})
                UNION SELECT oc.offer_id, cp.product_id FROM offer_categories oc JOIN category_product cp ON cp.category_id = oc.category_id WHERE oc.offer_id IN ({$in})
            ) x GROUP BY offer_id
            SQL))->mapWithKeys(fn ($r) => [(int) $r->offer_id => (int) $r->n])->all();
    }
}
