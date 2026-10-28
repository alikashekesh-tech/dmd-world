<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/** GET /api/v1/health — is the API up and can it reach MySQL (for the reverse proxy and uptime checks). */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');
            $database = true;
        } catch (Throwable $e) {
            report($e);
            $database = false;
        }

        return response()->json([
            'status' => $database ? 'ok' : 'degraded',
            'database' => $database ? 'up' : 'down',
            'time' => now()->toIso8601String(),
        ], $database ? 200 : 503);
    }
}
