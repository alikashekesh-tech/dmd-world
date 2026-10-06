<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One change to a product's stock and what it left. Written only by InventoryService; never edited. */
#[Fillable(['product_id', 'quantity_change', 'quantity_after', 'reason', 'order_id', 'admin_id', 'note'])]
class InventoryMovement extends Model
{
    public const UPDATED_AT = null;

    public const REASONS = ['adjustment', 'restock', 'order', 'cancellation', 'import'];

    protected function casts(): array
    {
        return ['quantity_change' => 'integer', 'quantity_after' => 'integer', 'created_at' => 'datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class);
    }
}
