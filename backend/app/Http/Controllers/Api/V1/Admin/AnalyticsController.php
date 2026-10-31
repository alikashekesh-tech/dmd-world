<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AssistantUsage;
use App\Services\Assistant\AssistantBudget;
use App\Services\Assistant\AssistantProvider;
use App\Services\StoreSettings;
use Illuminate\Http\JsonResponse;

/**
 * The owner's analytics setup: whether Google Analytics 4 is connected (reports themselves are in Google Analytics;
 * sales figures are on the dashboard, from MySQL) and how the shopping assistant is used. Real figures only.
 */
class AnalyticsController extends Controller
{
    public function show(AssistantProvider $provider): JsonResponse
    {
        $days = AssistantUsage::where('day', '>=', now()->subDays(29)->toDateString())->orderBy('day')->get();
        $period = StoreSettings::get('assistant_ai_budget_period');

        return response()->json(['data' => [
            'ga4' => ['measurement_id' => StoreSettings::get('ga4_measurement_id'), 'connected' => (bool) StoreSettings::get('ga4_measurement_id')],
            'assistant' => [
                'enabled' => (bool) StoreSettings::get('assistant_enabled'),
                'ai_connected' => $provider->available(),
                'budget' => ['usd' => StoreSettings::get('assistant_ai_budget_usd'), 'period' => $period,
                    'spent_usd' => in_array($period, AssistantBudget::PERIODS, true) ? round(AssistantBudget::spent($period), 4) : null],
                'totals' => [
                    'questions' => (int) $days->sum('questions'), 'answered' => (int) $days->sum('answered'), 'unanswered' => (int) $days->sum('unanswered'),
                    'ai_requests' => (int) $days->sum('ai_requests'), 'ai_failures' => (int) $days->sum('ai_failures'),
                    'ai_input_tokens' => (int) $days->sum('ai_input_tokens'), 'ai_output_tokens' => (int) $days->sum('ai_output_tokens'),
                    'ai_cost_usd' => round((float) $days->sum('ai_cost_usd'), 4),
                ],
                'days' => $days->map(fn ($d) => ['day' => $d->day->toDateString(), 'questions' => $d->questions, 'answered' => $d->answered, 'unanswered' => $d->unanswered])->values(),
            ],
        ]]);
    }
}
