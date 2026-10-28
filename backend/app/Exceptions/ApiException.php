<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business-rule failure the client can act on, e.g. new ApiException(409, 'EMAIL_ALREADY_EXISTS', '…').
 * Rendered as {"error": {"code", "message", "fields"?}} by ApiExceptionRenderer.
 */
class ApiException extends RuntimeException
{
    /**
     * @param  array<string, list<string>>  $fields
     * @param  array<string, string>  $headers
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }
}
