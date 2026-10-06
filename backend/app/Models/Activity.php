<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/** One line of the store's activity: who (owner, buyer or the system) did what to which record. */
#[Fillable(['admin_id', 'user_id', 'action', 'subject_type', 'subject_id', 'description'])]
class Activity extends Model
{
    protected $table = 'activity_log';

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class);
    }

    /** Records an action. $subject is the model it concerns (its short type and id are stored). */
    public static function record(string $action, string $description, ?Model $subject = null, ?Admin $admin = null, ?User $user = null): self
    {
        return self::create([
            'admin_id' => $admin?->id,
            'user_id' => $user?->id,
            'action' => $action,
            'subject_type' => $subject ? Str::snake(class_basename($subject)) : null,
            'subject_id' => $subject?->getKey(),
            'description' => Str::limit($description, 250),
        ]);
    }
}
