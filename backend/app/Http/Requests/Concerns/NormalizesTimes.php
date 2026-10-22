<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Support\Carbon;
use Throwable;

/**
 * Converts the request's time fields (static::TIME_FIELDS) to UTC before the rules run. The admin sends ISO 8601
 * times with an offset (the store's time zone, e.g. "2026-10-20T10:00:00+03:00"); Eloquent would otherwise keep
 * the wall-clock part and drop the offset, storing 10:00 UTC instead of 07:00 UTC. Values that can't be parsed are
 * left as they are, for the `date` rule to reject.
 */
trait NormalizesTimes
{
    protected function normalizeTimes(): void
    {
        $clean = [];
        foreach (static::TIME_FIELDS as $key) {
            $value = $this->input($key);
            if (! is_string($value) || trim($value) === '') {
                continue;
            }
            try {
                $clean[$key] = Carbon::parse(trim($value))->utc()->format('Y-m-d\TH:i:s\Z');
            } catch (Throwable) {
                // not a time: the `date` rule reports it
            }
        }
        $this->merge($clean);
    }
}
