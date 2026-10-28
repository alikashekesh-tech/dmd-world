<?php

namespace Tests\Feature\Platform;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;
use Tests\TestCase;

/**
 * Every route, read from the route table (so a route added later is covered too): the owner's API needs the owner's
 * session, a buyer's account needs a buyer, and nothing private answers a guest or the wrong kind of user.
 */
class AuthorizationMatrixTest extends TestCase
{
    use RefreshDatabase;

    /** The only owner routes a signed-out browser may call. */
    private const ADMIN_PUBLIC = ['api/v1/admin/auth/login', 'api/v1/admin/auth/logout'];

    /** Storefront routes that need a signed-in buyer. */
    private const BUYER_ONLY = ['#^api/v1/account#', '#^api/v1/wishlist#', '#^api/v1/auth/me$#', '#^api/v1/auth/password$#'];

    /** @return list<array{string, string}> [method, uri] with route parameters filled in */
    private function routes(callable $filter): array
    {
        $out = [];
        foreach (Router::getRoutes()->getRoutes() as $route) {
            /** @var Route $route */
            if (! $filter($route->uri())) {
                continue;
            }
            $method = collect($route->methods())->reject(fn ($m) => $m === 'HEAD')->first();
            // Each parameter gets a value its route accepts ({key} is letters, ids are numbers), so the request reaches
            // the auth check instead of stopping at a routing 404.
            $uri = preg_replace_callback('/\{(\w+)\??\}/', function ($m) use ($route) {
                $pattern = $route->wheres[$m[1]] ?? null;

                return collect(['1', 'featured'])->first(fn ($v) => ! $pattern || preg_match("#^(?:{$pattern})$#", $v)) ?? '1';
            }, $route->uri());
            $out[] = [$method, '/'.$uri];
        }

        return $out;
    }

    private function adminUri(string $uri): bool
    {
        return str_starts_with($uri, 'api/v1/admin') && ! in_array($uri, self::ADMIN_PUBLIC, true);
    }

    public function test_every_owner_route_requires_the_owner_guard_and_session_check(): void
    {
        $unguarded = [];
        foreach (Router::getRoutes()->getRoutes() as $route) {
            if ($this->adminUri($route->uri())) {
                $mw = $route->gatherMiddleware();
                if (! in_array('auth:admin', $mw, true) || ! in_array('auth.session', $mw, true)) {
                    $unguarded[] = $route->uri();
                }
            }
        }
        $this->assertSame([], $unguarded);
        $this->assertGreaterThan(70, count($this->routes($this->adminUri(...))), 'the route table was read');
    }

    public function test_guests_and_buyers_get_401_from_every_owner_route(): void
    {
        $guest = $this->client();
        $buyer = $this->buyer();
        $leaks = [];
        foreach ($this->routes($this->adminUri(...)) as [$method, $uri]) {
            foreach (['guest' => $guest, 'buyer' => $buyer] as $who => $browser) {
                $status = $browser->json($method, $uri)->status();
                if ($status !== 401) {
                    $leaks[] = "{$who} {$method} {$uri} → {$status}";
                }
            }
        }
        $this->assertSame([], $leaks);
    }

    public function test_guests_and_the_owner_get_401_from_every_buyer_route(): void
    {
        $buyerOnly = fn (string $uri) => collect(self::BUYER_ONLY)->contains(fn ($re) => preg_match($re, $uri));
        $routes = $this->routes($buyerOnly);
        $this->assertGreaterThan(15, count($routes));
        $guest = $this->client();
        $owner = $this->owner(); // an owner session is not a buyer session
        $leaks = [];
        foreach ($routes as [$method, $uri]) {
            foreach (['guest' => $guest, 'owner' => $owner] as $who => $browser) {
                $status = $browser->json($method, $uri)->status();
                if ($status !== 401) {
                    $leaks[] = "{$who} {$method} {$uri} → {$status}";
                }
            }
        }
        $this->assertSame([], $leaks);
    }
}
