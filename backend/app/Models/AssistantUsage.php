<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/** One day of the shopping assistant's use: counts only, never what was asked or by whom. */
class AssistantUsage extends Model
{
    protected $table = 'assistant_usage';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['day' => 'date', 'ai_cost_usd' => 'decimal:4'];
    }

    /** Adds to today's counts (one row per day, created on first use). */
    public static function add(array $counts): void
    {
        $day = now()->toDateString();
        DB::table('assistant_usage')->insertOrIgnore(['day' => $day, 'created_at' => now(), 'updated_at' => now()]);
        $set = ['updated_at' => now()];
        foreach ($counts as $column => $by) {
            $set[$column] = DB::raw("{$column} + ".(is_float($by) ? sprintf('%.6F', $by) : (int) $by));
        }
        DB::table('assistant_usage')->where('day', $day)->update($set);
    }
}
