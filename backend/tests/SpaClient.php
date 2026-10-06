<?php

namespace Tests;

use Illuminate\Testing\TestResponse;

/**
 * One browser on the storefront: it keeps its own cookies (session, remember-me, XSRF) between requests and
 * comes from its own address, so a test can have buyer A, buyer B and the owner side by side.
 */
final class SpaClient
{
    /** @var array<string, string> */
    public array $cookies = [];

    public function __construct(private TestCase $test, public string $ip = '10.0.0.1') {}

    public function get(string $uri, array $headers = []): TestResponse
    {
        return $this->json('GET', $uri, [], $headers);
    }

    public function post(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->json('POST', $uri, $data, $headers);
    }

    public function put(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->json('PUT', $uri, $data, $headers);
    }

    public function patch(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->json('PATCH', $uri, $data, $headers);
    }

    public function delete(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->json('DELETE', $uri, $data, $headers);
    }

    public function json(string $method, string $uri, array $data = [], array $headers = []): TestResponse
    {
        $response = $this->test->spaCall($this, $method, $uri, $data, $headers);
        foreach ($response->headers->getCookies() as $cookie) {
            $expired = $cookie->getExpiresTime() !== 0 && $cookie->getExpiresTime() < time();
            if ($expired || $cookie->getValue() === null || $cookie->getValue() === '') {
                unset($this->cookies[$cookie->getName()]);
            } else {
                $this->cookies[$cookie->getName()] = $cookie->getValue();
            }
        }

        return $response;
    }

    /** Forget the session but keep long-lived cookies (what a browser does after closing). */
    public function closeBrowser(): void
    {
        $this->cookies = array_filter($this->cookies, fn ($v, $k) => str_starts_with($k, 'remember_'), ARRAY_FILTER_USE_BOTH);
    }
}
