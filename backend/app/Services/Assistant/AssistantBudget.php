<?php

namespace App\Services\Assistant;

use App\Models\AssistantUsage;
use App\Services\StoreSettings;

/**
 * The spending ceiling for an AI provider (Admin › Settings). Both a dollar amount and its period (per day, per
 * month, or in total) must be set before any AI request is made: the store's budget and how it's counted aren't
 * decided yet, so nothing is assumed. Counted from the estimated cost the provider's own token counts give.
 */
final class AssistantBudget
{
    public const PERIODS = ['day', 'month', 'total'];

    public static function allows(): bool
    {
        $budget = StoreSettings::get('assistant_ai_budget_usd');
        $period = StoreSettings::get('assistant_ai_budget_period');
        if ($budget === null || ! in_array($period, self::PERIODS, true)) {
            return false;
        }

        return self::spent($period) < (float) $budget;
    }

    public static function spent(string $period): float
    {
        $q = AssistantUsage::query();
        if ($period === 'day') {
            $q->where('day', now()->toDateString());
        } elseif ($period === 'month') {
            $q->where('day', '>=', now()->startOfMonth()->toDateString());
        }

        return (float) $q->sum('ai_cost_usd');
    }
}
