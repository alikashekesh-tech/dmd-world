<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * One error shape for the whole API:
 *   {"error": {"code": "VALIDATION_FAILED", "message": "Enter a valid email address.", "fields": {"email": ["…"]}}}
 * Framework and database messages never reach the client (they name models, tables and queries); the full
 * exception is still logged by Laravel's normal reporting.
 */
class ApiExceptionRenderer
{
    private const HTTP = [
        400 => ['BAD_REQUEST', 'The request could not be understood.'],
        401 => ['UNAUTHENTICATED', 'Please sign in first.'],
        403 => ['FORBIDDEN', 'You don’t have access to this.'],
        404 => ['NOT_FOUND', 'Not found.'],
        405 => ['METHOD_NOT_ALLOWED', 'This action isn’t supported here.'],
        413 => ['PAYLOAD_TOO_LARGE', 'The request is too large.'],
        415 => ['UNSUPPORTED_MEDIA_TYPE', 'Send the request as JSON.'],
        419 => ['SESSION_EXPIRED', 'Your session expired. Refresh the page and try again.'],
        429 => ['TOO_MANY_REQUESTS', 'Too many requests. Please wait a moment and try again.'],
        503 => ['SERVICE_UNAVAILABLE', 'The store is briefly unavailable. Please try again shortly.'],
    ];

    public static function render(Throwable $e): JsonResponse
    {
        if ($e instanceof ApiException) {
            return self::json($e->status, $e->errorCode, $e->getMessage(), $e->fields, $e->headers);
        }

        if ($e instanceof ValidationException) {
            $fields = $e->errors();

            return self::json($e->status, 'VALIDATION_FAILED', collect($fields)->flatten()->first() ?? 'Please check the highlighted fields.', $fields);
        }

        if ($e instanceof AuthenticationException) {
            return self::json(401, ...self::HTTP[401]);
        }

        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            [$code, $message] = self::HTTP[$status] ?? ['HTTP_'.$status, $status >= 500 ? 'Something went wrong on our side.' : 'The request couldn’t be completed.'];
            // Messages passed to abort() for 400/403/409 are written for the buyer; anything else stays generic.
            if (in_array($status, [400, 403, 409], true) && $e->getMessage() !== '') {
                $message = $e->getMessage();
            }

            return self::json($status, $code, $message, [], $e->getHeaders());
        }

        return self::json(500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.');
    }

    /**
     * @param  array<string, list<string>>  $fields
     * @param  array<string, string>  $headers
     */
    private static function json(int $status, string $code, string $message, array $fields = [], array $headers = []): JsonResponse
    {
        $error = ['code' => $code, 'message' => $message];
        if ($fields) {
            $error['fields'] = $fields;
        }

        return new JsonResponse(['error' => $error], $status, $headers);
    }
}
