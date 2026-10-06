<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CouponRequest;
use App\Models\Activity;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\CouponTarget;
use App\Models\Product;
use App\Services\Coupons;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** Discount codes. DELETE moves one to the trash; /restore brings it back; /permanent removes one never used. */
class CouponController extends Controller
{
    public function __construct(private Coupons $coupons) {}

    /** ?trashed=only|with&q= */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate(['trashed' => ['nullable', 'in:only,with'], 'q' => ['nullable', 'string', 'max:60']]);
        $list = Coupon::query()->with('targets')
            ->withCount(['redemptions as counted_uses' => fn (Builder $q) => $q->whereHas('order', fn ($o) => $o->whereNotIn('status', ['cancelled', 'failed']))])
            ->withSum(['redemptions as discount_given' => fn (Builder $q) => $q->whereHas('order', fn ($o) => $o->whereNotIn('status', ['cancelled', 'failed']))], 'discount')
            ->when(($v['trashed'] ?? null) === 'only', fn ($q) => $q->onlyTrashed())
            ->when(($v['trashed'] ?? null) === 'with', fn ($q) => $q->withTrashed())
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where('code', 'like', '%'.addcslashes(Coupon::normalize($term), '%_\\').'%'))
            ->latest('id')->get();

        return response()->json(['data' => $list->map(fn (Coupon $c) => $this->row($c))->values()]);
    }

    public function show(Coupon $coupon): JsonResponse
    {
        $recent = CouponRedemption::query()->where('coupon_id', $coupon->id)->with('order:id,number,status,total,first_name,last_name,placed_at')->latest('id')->limit(20)->get();

        return response()->json(['data' => $this->row($this->withUses($coupon)) + ['recent_orders' => $recent->map(fn ($r) => [
            'order_id' => $r->order_id, 'number' => $r->order?->number, 'status' => $r->order?->status, 'customer' => $r->order?->customerName(),
            'discount' => Money::json(Money::cents($r->discount)), 'placed_at' => $r->order?->placed_at?->toIso8601String(),
        ])]]);
    }

    public function store(CouponRequest $request): JsonResponse
    {
        $coupon = $this->save(new Coupon, $request->validated(), $request);

        return $this->show($coupon)->setStatusCode(201);
    }

    public function update(CouponRequest $request, Coupon $coupon): JsonResponse
    {
        return $this->show($this->save($coupon, $request->validated(), $request));
    }

    public function destroy(Request $request, Coupon $coupon): Response
    {
        $coupon->delete();
        Activity::record('coupon.trashed', "Moved coupon {$coupon->code} to the trash", $coupon, $request->user('admin'));

        return response()->noContent();
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $coupon = Coupon::onlyTrashed()->findOrFail($id);
        $coupon->restore();
        $coupon->forceFill(['is_active' => false])->save(); // comes back switched off until the owner enables it
        Activity::record('coupon.restored', "Restored coupon {$coupon->code} (switched off)", $coupon, $request->user('admin'));

        return $this->show($coupon);
    }

    /** Only a trashed coupon that no order ever used: orders keep pointing at the codes they used. */
    public function forceDestroy(Request $request, int $id): Response
    {
        $coupon = Coupon::onlyTrashed()->findOrFail($id);
        if ($coupon->redemptions()->exists()) {
            throw new ApiException(409, 'COUPON_IN_USE', 'Orders used this code, so it stays in the trash for their history.');
        }
        $coupon->forceDelete();
        Activity::record('coupon.deleted', "Permanently deleted coupon {$coupon->code}", null, $request->user('admin'));

        return response()->noContent();
    }

    private function save(Coupon $coupon, array $v, Request $request): Coupon
    {
        $targets = [
            ['product', false, $v['product_ids'] ?? null], ['category', false, $v['category_ids'] ?? null],
            ['product', true, $v['excluded_product_ids'] ?? null], ['category', true, $v['excluded_category_ids'] ?? null],
        ];
        foreach ($targets as [$type, , $ids]) {
            $ids = array_values(array_unique($ids ?? []));
            $model = $type === 'product' ? Product::withTrashed() : Category::withTrashed();
            if ($ids && $model->whereKey($ids)->count() !== count($ids)) {
                throw new ApiException(422, 'UNKNOWN_TARGET', "One of the {$type}s doesn’t exist.");
            }
        }
        $created = ! $coupon->exists;
        DB::transaction(function () use ($coupon, $v, $targets) {
            $coupon->forceFill([
                'code' => $v['code'], 'description' => $v['description'] ?? null, 'discount_type' => $v['discount_type'],
                'amount' => Money::decimal(Money::cents($v['amount'])),
                'minimum_spend' => isset($v['minimum_spend']) ? Money::decimal(Money::cents($v['minimum_spend'])) : null,
                'maximum_spend' => isset($v['maximum_spend']) ? Money::decimal(Money::cents($v['maximum_spend'])) : null,
                'usage_limit' => $v['usage_limit'] ?? null, 'usage_limit_per_customer' => $v['usage_limit_per_customer'] ?? null,
                'exclude_sale_items' => (bool) ($v['exclude_sale_items'] ?? false), 'starts_at' => $v['starts_at'] ?? null, 'expires_at' => $v['expires_at'] ?? null,
                'is_active' => (bool) ($v['is_active'] ?? true),
            ])->save();
            foreach ($targets as [$type, $excluded, $ids]) {
                if ($ids === null) {
                    continue; // not sent: unchanged
                }
                CouponTarget::where('coupon_id', $coupon->id)->where('target_type', $type)->where('is_excluded', $excluded)->delete();
                CouponTarget::insert(array_map(fn ($id) => ['coupon_id' => $coupon->id, 'target_type' => $type, 'target_id' => $id, 'is_excluded' => $excluded], array_values(array_unique($ids))));
            }
        });
        Activity::record($created ? 'coupon.created' : 'coupon.updated', ($created ? 'Created' : 'Updated')." coupon {$coupon->code} ({$coupon->label()})", $coupon, $request->user('admin'));

        return $coupon->refresh();
    }

    private function withUses(Coupon $coupon): Coupon
    {
        $coupon->loadMissing('targets');
        $counted = fn (Builder $q) => $q->whereHas('order', fn ($o) => $o->whereNotIn('status', ['cancelled', 'failed']));

        return $coupon->loadCount(['redemptions as counted_uses' => $counted])->loadSum(['redemptions as discount_given' => $counted], 'discount');
    }

    private function row(Coupon $c): array
    {
        $ids = fn (string $type, bool $excluded) => $c->targets->where('target_type', $type)->where('is_excluded', $excluded)->pluck('target_id')->values();

        return [
            'id' => $c->id, 'code' => $c->code, 'description' => $c->description, 'discount_type' => $c->discount_type, 'amount' => (float) $c->amount,
            'label' => $c->label(),
            'minimum_spend' => $c->minimum_spend !== null ? (float) $c->minimum_spend : null, 'maximum_spend' => $c->maximum_spend !== null ? (float) $c->maximum_spend : null,
            'usage_limit' => $c->usage_limit, 'usage_limit_per_customer' => $c->usage_limit_per_customer,
            'uses' => $c->imported_uses + (int) $c->counted_uses, 'imported_uses' => $c->imported_uses,
            'discount_given' => Money::json(Money::cents($c->discount_given ?? 0)),
            'exclude_sale_items' => $c->exclude_sale_items, 'starts_at' => $c->starts_at?->toIso8601String(), 'expires_at' => $c->expires_at?->toIso8601String(),
            'is_active' => $c->is_active, 'trashed' => $c->trashed(),
            'product_ids' => $ids('product', false), 'category_ids' => $ids('category', false),
            'excluded_product_ids' => $ids('product', true), 'excluded_category_ids' => $ids('category', true),
            'created_at' => $c->created_at?->toIso8601String(), 'updated_at' => $c->updated_at?->toIso8601String(),
        ];
    }
}
