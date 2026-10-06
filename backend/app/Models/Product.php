<?php

namespace App\Models;

use App\Services\Catalog;
use App\Services\StockAlerts;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A product: one row that feeds the storefront, search, category and brand pages, the cart, checkout and the admin.
 * Prices come from Pricing, availability from Inventory; stock_quantity only changes through InventoryService.
 */
#[Fillable([
    'brand_id', 'name', 'slug', 'sku', 'short_description', 'description', 'regular_price', 'sale_price',
    'sale_starts_at', 'sale_ends_at', 'status', 'is_featured', 'track_stock', 'low_stock_threshold', 'stock_status',
    'weight_kg', 'length_cm', 'width_cm', 'height_cm',
])]
class Product extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUSES = ['draft', 'published'];

    protected function casts(): array
    {
        return [
            'regular_price' => 'decimal:2',
            'sale_price' => 'decimal:2',
            'sale_starts_at' => 'datetime',
            'sale_ends_at' => 'datetime',
            'is_featured' => 'boolean',
            'track_stock' => 'boolean',
            'stock_quantity' => 'integer',
            'low_stock_threshold' => 'integer',
            'weight_kg' => 'decimal:3',
            'length_cm' => 'decimal:2',
            'width_cm' => 'decimal:2',
            'height_cm' => 'decimal:2',
            'published_at' => 'datetime',
            'brand_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // Any change to a product refreshes the storefront catalog at once.
        static::saved(function (Product $p) {
            Catalog::bust();
            StockAlerts::afterChange($p); // emails waiting buyers if this change brought it back
        });
        static::deleted(fn () => Catalog::bust());
        static::restored(fn () => Catalog::bust()); // restore() saves, so `saved` above has already run
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class)->withTrashed();
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class)->withPivot('is_primary');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('position')->orderBy('id');
    }

    public function specifications(): HasMany
    {
        return $this->hasMany(ProductSpecification::class)->orderBy('position')->orderBy('id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class)->latest('id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function stockAlerts(): HasMany
    {
        return $this->hasMany(StockAlert::class);
    }

    /** Adds `rating_avg` and `rating_count` from approved reviews. Computed from the reviews, never stored. */
    public function scopeWithRating(Builder $query): void
    {
        $query->addSelect([
            'rating_avg' => Review::query()->selectRaw('AVG(rating)')->whereColumn('reviews.product_id', 'products.id')->where('status', 'approved'),
            'rating_count' => Review::query()->selectRaw('COUNT(*)')->whereColumn('reviews.product_id', 'products.id')->where('status', 'approved'),
        ]);
    }

    /** Adds `units_sold`: how many were bought in orders that count as sales. Computed from orders, never stored. */
    public function scopeWithUnitsSold(Builder $query): void
    {
        $query->addSelect(['units_sold' => OrderItem::query()->selectRaw('COALESCE(SUM(order_items.quantity), 0)')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereColumn('order_items.product_id', 'products.id')
            ->whereIn('orders.status', Order::PAID)]);
    }

    /** On the storefront: published and not archived. */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', 'published');
    }

    public function isPublished(): bool
    {
        return $this->status === 'published' && ! $this->trashed();
    }
}
