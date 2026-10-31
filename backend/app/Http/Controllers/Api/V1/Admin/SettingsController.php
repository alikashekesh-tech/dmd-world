<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Messaging\Outbox;
use App\Services\StoreSettings;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The owner's store settings. Only the keys sent are changed; unknown keys are refused. */
class SettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return $this->answer(StoreSettings::all());
    }

    public function update(Request $request): JsonResponse
    {
        $unknown = array_diff(array_keys($request->all()), array_keys(StoreSettings::DEFAULTS));
        if ($unknown) {
            throw new ApiException(422, 'UNKNOWN_SETTING', 'Unknown setting: '.implode(', ', $unknown).'.');
        }
        // Only the settings sent are checked and saved (each rule set keyed by its setting, arrays by their items).
        $rules = collect(StoreSettings::rules())->filter(fn ($r, $key) => $request->has(strtok($key, '.')))->map(fn ($r) => ['present', ...$r]);
        $values = $request->validate($rules->all());
        if (! empty($values['order_notification_phone'])) {
            $values['order_notification_phone'] = Phone::normalize($values['order_notification_phone']);
        }

        return $this->answer(StoreSettings::put($values, $request->user('admin')));
    }

    private function answer(array $values): JsonResponse
    {
        return response()->json(['data' => $values, 'meta' => [
            'payment_methods' => Order::PAYMENT_METHODS,
            'delivery_methods' => Order::DELIVERY_METHODS,
            'public' => StoreSettings::PUBLIC,
            // Which WhatsApp/SMS texts can actually go out (a provider must be set up on the server first).
            'messaging' => ['whatsapp' => app(Outbox::class)->available('whatsapp'), 'sms' => app(Outbox::class)->available('sms')],
        ]]);
    }
}
